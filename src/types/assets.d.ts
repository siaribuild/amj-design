// Side-effect stylesheet imports.
//
// Vite resolves `import "./styles/index.css"` at build time; TypeScript has no
// idea what a .css module is and reported one TS2882 per import. Four errors
// that mean nothing, sitting in the same backlog as two that meant something —
// which is the argument for clearing the noise rather than learning to scroll
// past it.
declare module "*.css";
declare module "*.svg";
