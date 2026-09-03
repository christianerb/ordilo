// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

/**
 * Visual preview harness (ORDILO_PREVIEW=1): the app renders on the web with
 * fixture data instead of Supabase, and the modules that only exist on a
 * phone (scanner, keychain, push, biometrics, native date picker, recorder)
 * are swapped for quiet stubs. A normal build never reads this block.
 */
if (process.env.ORDILO_PREVIEW === "1") {
  const stubs = {
    "expo-secure-store": path.join(__dirname, "preview/stubs/secure-store.ts"),
    "expo-local-authentication": path.join(__dirname, "preview/stubs/local-authentication.ts"),
    "expo-notifications": path.join(__dirname, "preview/stubs/notifications.ts"),
    "@dariyd/react-native-document-scanner": path.join(__dirname, "preview/stubs/document-scanner.ts"),
    "@react-native-community/datetimepicker": path.join(__dirname, "preview/stubs/datetimepicker.tsx"),
    "expo-audio": path.join(__dirname, "preview/stubs/expo-audio.ts"),
  };
  const fakeSupabase = path.join(__dirname, "preview/fake-supabase.ts");
  const realSupabase = path.join(__dirname, "src/lib/supabase.ts");
  const defaultResolver = config.resolver.resolveRequest;

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (stubs[moduleName]) {
      return { type: "sourceFile", filePath: stubs[moduleName] };
    }
    const resolved = defaultResolver
      ? defaultResolver(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
    if (
      resolved.type === "sourceFile" &&
      resolved.filePath === realSupabase &&
      !context.originModulePath.startsWith(path.join(__dirname, "preview"))
    ) {
      return { type: "sourceFile", filePath: fakeSupabase };
    }
    return resolved;
  };

  // The preview may run from a git worktree beside the main checkout; the
  // hoisted node_modules stay where the workspace root put them.
  const workspaceModules = process.env.ORDILO_PREVIEW_NODE_MODULES;
  if (workspaceModules) {
    config.watchFolders = [...(config.watchFolders ?? []), workspaceModules];
    config.resolver.nodeModulesPaths = [
      ...(config.resolver.nodeModulesPaths ?? []),
      workspaceModules,
    ];
  }
}

module.exports = config;
