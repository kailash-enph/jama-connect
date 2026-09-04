# data/

This directory is bundled inside the jama-connect Python wheel.

## jama-editor.vsix
The VS Code extension package. Installed automatically by jama-post-install
or on first daemon startup via code --install-extension.

To update: rebuild the extension (
ode esbuild.mjs && vsce package) and
copy the new .vsix over this file, then rebuild the Python wheel.
