import v1 from "./migration_v1.sql" with { type: "text" };
import v2 from "./migration_v2.sql" with { type: "text" };

export default [v1, v2];
