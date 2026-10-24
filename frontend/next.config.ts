import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sibling packages ship TypeScript source (their package.json "main"
  // points at src/index.ts), so Next must transpile them.
  transpilePackages: ["@impactx/backend", "@impactx/ml"],
  // The ML package's live ONNX detector loads @huggingface/transformers,
  // whose Node build carries native .node binaries webpack cannot parse.
  // Server bundles leave it external (Node resolves it at runtime);
  // client bundles alias it to its web build (see webpack() below).
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-web"],
  webpack: (config, { isServer, webpack }) => {
    // The sibling packages write ESM-style "./money.js" specifiers that
    // point at TypeScript sources; map .js -> .ts/.tsx so webpack can
    // resolve them inside the transpiled packages.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    if (!isServer) {
      // webpack throws UnhandledSchemeError for "node:" requests during
      // factorize — before alias resolution runs — so the shims are
      // wired through NormalModuleReplacementPlugin, which hooks
      // earlier, in addition to the aliases below.
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:crypto$/,
          path.resolve(__dirname, "src/lib/nodeCryptoShim.ts"),
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^node:fs$/,
          path.resolve(__dirname, "src/lib/nodeFsShim.ts"),
        ),
      );
      // The engine's AuditLog and ML provenance hash with node:crypto,
      // and the ML detector-table loader imports node:fs — neither
      // exists in a browser bundle. Alias them to small local shims for
      // client builds only; the server keeps the real Node modules.
      // The SHA-256 shim is a faithful FIPS 180-4 implementation, so
      // audit-chain hashes computed in the browser match the server's.
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "node:crypto": path.resolve(__dirname, "src/lib/nodeCryptoShim.ts"),
        crypto: path.resolve(__dirname, "src/lib/nodeCryptoShim.ts"),
        "node:fs": path.resolve(__dirname, "src/lib/nodeFsShim.ts"),
        fs: path.resolve(__dirname, "src/lib/nodeFsShim.ts"),
        // Browser build of the transformers library (WASM ONNX runtime);
        // the package's node condition would drag in native binaries.
        "@huggingface/transformers": path.resolve(
          __dirname,
          "../ml/node_modules/@huggingface/transformers/dist/transformers.web.js",
        ),
      };
    }
    // @impactx/ml's package exports point at dist/ (built by its own
    // `npm run build`); until that exists, consume its TypeScript source
    // directly — the same arrangement @impactx/backend uses. This alias
    // is harmless once dist/ is built.
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@impactx/ml": path.resolve(__dirname, "../ml/src/index.ts"),
    };
    if (isServer) {
      // Belt and braces alongside serverExternalPackages: the dynamic
      // import of @huggingface/transformers inside the transpiled ML
      // source must stay a runtime require on the server, never a
      // bundled module (its Node build ships native .node binaries).
      const externals = (config.externals ?? []) as unknown[];
      externals.push({
        "@huggingface/transformers": "commonjs @huggingface/transformers",
        "onnxruntime-node": "commonjs onnxruntime-node",
      });
      // node: scheme imports inside the transpiled sibling sources must
      // stay runtime requires on the server (webpack's UnhandledScheme
      // otherwise) — Node resolves the real builtins at runtime.
      externals.push(
        (
          { request }: { request?: string },
          callback: (err?: Error | null, result?: string) => void,
        ) => {
          if (request && request.startsWith("node:")) {
            callback(null, `commonjs ${request}`);
            return;
          }
          callback();
        },
      );
      config.externals = externals as never;
      // Bare "node:fs"-style imports inside the transpiled sibling
      // sources trip webpack's UnhandledSchemeError before externals
      // are consulted; stripping the prefix turns them into the bare
      // builtin names Next externalises correctly on the server.
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
