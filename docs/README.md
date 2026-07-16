# Touitomamout documentation

The documentation is built with [Sphinx](https://www.sphinx-doc.org/), the
[Furo](https://pradyunsg.me/furo/) theme, and
[uv](https://docs.astral.sh/uv/).

Build the site from this directory:

```sh
uv run sphinx-build -W --keep-going -b html source _build/html
```

Alternatively, run `make html`. Open `_build/html/index.html` to inspect the
result, or run `make serve` and visit <http://localhost:8000>.

Dependencies are isolated from the application and locked in `uv.lock`.
