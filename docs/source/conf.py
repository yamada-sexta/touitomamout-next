project = "Touitomamout"
copyright = "2026, Touitomamout contributors"
author = "Touitomamout contributors"

extensions = []
source_suffix = {".rst": "restructuredtext"}
exclude_patterns = []

html_theme = "furo"
html_title = "Touitomamout Documentation"
html_logo = "_static/touitomamout.svg"
html_favicon = "_static/touitomamout.svg"
html_static_path = ["_static"]
html_css_files = ["touitomamout.css"]
html_show_copyright = False
html_show_sphinx = False
show_source = False

html_theme_options = {
    "light_css_variables": {
        "color-brand-primary": "#1c71d8",
        "color-brand-content": "#1c71d8",
        "color-link": "#1a5fb4",
        "color-link--hover": "#1c71d8",
    },
    "dark_css_variables": {
        "color-brand-primary": "#99c1f1",
        "color-brand-content": "#99c1f1",
        "color-link": "#99c1f1",
        "color-link--hover": "#62a0ea",
    },
    "source_repository": "https://github.com/yamada-sexta/touitomamout-next/",
    "source_branch": "main",
    "source_directory": "docs/source/",
    "navigation_with_keys": True,
}
