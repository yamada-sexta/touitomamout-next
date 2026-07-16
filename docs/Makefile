UV ?= uv
SOURCEDIR = source
BUILDDIR = _build

.PHONY: html clean serve

html:
	$(UV) run sphinx-build -W --keep-going -b html $(SOURCEDIR) $(BUILDDIR)/html

clean:
	rm -rf $(BUILDDIR)

serve: html
	$(UV) run python -m http.server --directory $(BUILDDIR)/html 8000
