import { rm } from "node:fs/promises";

const cacheDirectories = [
  new URL("../.vinext/", import.meta.url),
  new URL("../.next/", import.meta.url),
  new URL("../dist/", import.meta.url),
  new URL("../node_modules/.vite/", import.meta.url),
];

await Promise.all(
  cacheDirectories.map((directory) =>
    rm(directory, { force: true, recursive: true }),
  ),
);
