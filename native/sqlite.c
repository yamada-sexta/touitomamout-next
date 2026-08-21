#include <sqlite3.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  uint32_t row_index;
  int out_of_memory;
} query_context;

static sqlite3 *database = NULL;
static uint8_t *query_result = NULL;
static size_t query_result_length = 0;
static size_t query_result_capacity = 0;

#define QUERY_RESULT_LIMIT ((size_t)64 * 1024 * 1024)

static void reset_query_result(void) {
  query_result_length = 0;
}

static int reserve_query_result(size_t additional) {
  if (additional > SIZE_MAX - query_result_length) return 0;
  size_t required = query_result_length + additional;
  if (required > QUERY_RESULT_LIMIT) return 0;
  if (required <= query_result_capacity) return 1;

  size_t capacity = query_result_capacity == 0 ? 256 : query_result_capacity;
  while (capacity < required) {
    if (capacity > SIZE_MAX / 2) {
      capacity = required;
      break;
    }
    capacity *= 2;
  }

  uint8_t *next = realloc(query_result, capacity);
  if (next == NULL) return 0;
  query_result = next;
  query_result_capacity = capacity;
  return 1;
}

static int append_bytes(const void *value, size_t length) {
  if (!reserve_query_result(length)) return 0;
  if (length > 0) memcpy(query_result + query_result_length, value, length);
  query_result_length += length;
  return 1;
}

static int append_byte(uint8_t value) {
  return append_bytes(&value, 1);
}

static int append_json_string(const char *value) {
  static const char hex[] = "0123456789abcdef";
  if (!append_byte('"')) return 0;
  for (const uint8_t *cursor = (const uint8_t *)value; *cursor != 0; cursor++) {
    uint8_t byte = *cursor;
    switch (byte) {
      case '"':
        if (!append_bytes("\\\"", 2)) return 0;
        break;
      case '\\':
        if (!append_bytes("\\\\", 2)) return 0;
        break;
      case '\b':
        if (!append_bytes("\\b", 2)) return 0;
        break;
      case '\f':
        if (!append_bytes("\\f", 2)) return 0;
        break;
      case '\n':
        if (!append_bytes("\\n", 2)) return 0;
        break;
      case '\r':
        if (!append_bytes("\\r", 2)) return 0;
        break;
      case '\t':
        if (!append_bytes("\\t", 2)) return 0;
        break;
      default:
        if (byte < 0x20) {
          uint8_t escaped[] = {'\\', 'u', '0', '0', hex[byte >> 4], hex[byte & 0xf]};
          if (!append_bytes(escaped, sizeof escaped)) return 0;
        } else if (!append_byte(byte)) {
          return 0;
        }
    }
  }
  return append_byte('"');
}

static char *copy_string(const uint8_t *value, size_t length) {
  if (length == SIZE_MAX || (length > 0 && value == NULL)) return NULL;
  char *copy = malloc(length + 1);
  if (copy == NULL) return NULL;
  if (length > 0) memcpy(copy, value, length);
  copy[length] = '\0';
  return copy;
}

static int has_embedded_nul(const uint8_t *value, size_t length) {
  return length > 0 &&
         (value == NULL || memchr(value, '\0', length) != NULL);
}

int32_t touitomamout_database_open(const uint8_t *path, size_t path_length) {
  if (has_embedded_nul(path, path_length)) return SQLITE_MISUSE;
  if (database != NULL) {
    sqlite3_close_v2(database);
    database = NULL;
  }

  char *path_string = copy_string(path, path_length);
  if (path_string == NULL) return SQLITE_NOMEM;
  int result = sqlite3_open_v2(path_string, &database,
                               SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
                                   SQLITE_OPEN_FULLMUTEX,
                               NULL);
  free(path_string);
  if (result == SQLITE_OK) {
    sqlite3_busy_timeout(database, 5000);
  } else if (database != NULL) {
    sqlite3_close_v2(database);
    database = NULL;
  }
  return result;
}

void touitomamout_database_close(void) {
  if (database != NULL) {
    sqlite3_close_v2(database);
    database = NULL;
  }
  free(query_result);
  query_result = NULL;
  query_result_length = 0;
  query_result_capacity = 0;
}

int32_t touitomamout_database_exec(const uint8_t *sql, size_t sql_length) {
  if (database == NULL) return SQLITE_MISUSE;
  if (has_embedded_nul(sql, sql_length)) return SQLITE_MISUSE;
  char *sql_string = copy_string(sql, sql_length);
  if (sql_string == NULL) return SQLITE_NOMEM;
  int result = sqlite3_exec(database, sql_string, NULL, NULL, NULL);
  free(sql_string);
  return result;
}

static int emit_row(void *opaque, int column_count, char **values,
                    char **columns) {
  query_context *query = opaque;
  if (query->row_index > 0 && !append_byte(',')) goto out_of_memory;
  if (!append_byte('{')) goto out_of_memory;
  for (int i = 0; i < column_count; i += 1) {
    if (i > 0 && !append_byte(',')) goto out_of_memory;
    const char *column = columns[i];
    const char *value = values[i];
    if (!append_json_string(column) || !append_byte(':')) goto out_of_memory;
    if (value == NULL) {
      if (!append_bytes("null", 4)) goto out_of_memory;
    } else if (!append_json_string(value)) {
      goto out_of_memory;
    }
  }
  if (!append_byte('}')) goto out_of_memory;
  query->row_index += 1;
  return 0;

out_of_memory:
  query->out_of_memory = 1;
  return 1;
}

int32_t touitomamout_database_query(const uint8_t *sql, size_t sql_length) {
  if (database == NULL) return SQLITE_MISUSE;
  if (has_embedded_nul(sql, sql_length)) return SQLITE_MISUSE;
  reset_query_result();
  if (!append_byte('[')) return SQLITE_NOMEM;
  char *sql_string = copy_string(sql, sql_length);
  if (sql_string == NULL) return SQLITE_NOMEM;
  query_context query = {.row_index = 0, .out_of_memory = 0};
  int result = sqlite3_exec(database, sql_string, emit_row, &query, NULL);
  free(sql_string);
  if (query.out_of_memory) return SQLITE_NOMEM;
  if (!append_byte(']')) return SQLITE_NOMEM;
  return result;
}

uint32_t touitomamout_database_query_result_length(void) {
  return query_result_length > UINT32_MAX ? UINT32_MAX
                                          : (uint32_t)query_result_length;
}

uint8_t touitomamout_database_query_result_byte(uint32_t index) {
  return index < query_result_length ? query_result[index] : 0;
}
