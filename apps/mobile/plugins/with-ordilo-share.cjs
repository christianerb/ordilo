const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Runs after expo-sharing's source generation. Keep native behavior in source
// control so clean EAS/prebuilds reproduce the durable, supported extension.
module.exports = (config) => withXcodeProject(config, (mod) => {
  const target = path.join(mod.modRequest.platformProjectRoot, 'expo-sharing-extension');
  fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'plugins/ordilo-share/ShareIntoViewController.swift'), path.join(target, 'ShareIntoViewController.swift'));
  const plistPath = path.join(target, 'Info.plist');
  const plist = fs.readFileSync(plistPath, 'utf8');
  if (!plist.includes('<key>CFBundleDisplayName</key>')) throw new Error('Missing share extension display name');
  fs.writeFileSync(plistPath, plist.replace(/(<key>CFBundleDisplayName<\/key>\s*)<string>[^<]*<\/string>/, '$1<string>Ordilo</string>'));
  return mod;
});
