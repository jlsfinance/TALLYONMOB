#!/usr/bin/env node

/**
 * Auto Version Increment Script
 * Increments version number in App.tsx and capacitor.config.ts before each build
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// File paths
const APP_TSX_PATH = join(__dirname, '..', 'client', 'src', 'App.tsx');
const CAPACITOR_CONFIG_PATH = join(__dirname, '..', 'capacitor.config.ts');

function incrementVersion(version) {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || 0) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
}

function updateAppTsx() {
    try {
        let content = readFileSync(APP_TSX_PATH, 'utf8');

        // Find current version
        const versionMatch = content.match(/const APP_VERSION = ['"](.+?)['"]/);
        if (!versionMatch) {
            console.error('❌ Could not find APP_VERSION in App.tsx');
            return null;
        }

        const oldVersion = versionMatch[1];
        const newVersion = incrementVersion(oldVersion);

        // Replace version
        content = content.replace(
            /const APP_VERSION = ['"](.+?)['"]/,
            `const APP_VERSION = '${newVersion}'`
        );

        writeFileSync(APP_TSX_PATH, content, 'utf8');
        console.log(`✅ App.tsx: ${oldVersion} → ${newVersion}`);

        return newVersion;
    } catch (error) {
        console.error('❌ Error updating App.tsx:', error.message);
        return null;
    }
}

function updateCapacitorConfig(newVersion) {
    try {
        let content = readFileSync(CAPACITOR_CONFIG_PATH, 'utf8');

        // Extract current version and build number
        const versionMatch = content.match(/version:\s*['"](.+?)['"]/);
        const buildMatch = content.match(/buildNumber:\s*(\d+)/);

        const oldVersion = versionMatch ? versionMatch[1] : '1.0.0';
        const oldBuild = buildMatch ? parseInt(buildMatch[1]) : 1;
        const newBuild = oldBuild + 1;

        // Replace version and buildNumber
        content = content.replace(
            /version:\s*['"](.+?)['"]/,
            `version: '${newVersion}'`
        );
        content = content.replace(
            /buildNumber:\s*(\d+)/,
            `buildNumber: ${newBuild}`
        );

        writeFileSync(CAPACITOR_CONFIG_PATH, content, 'utf8');

        console.log(`✅ Capacitor Config: v${oldVersion} (${oldBuild}) → v${newVersion} (${newBuild})`);

        return true;
    } catch (error) {
        console.error('❌ Error updating capacitor.config.ts:', error.message);
        return false;
    }
}

function updateChangelog(version) {
    try {
        const CHANGELOG_PATH = join(__dirname, '..', 'client', 'src', 'components', 'ChangelogModal.tsx');
        let content = readFileSync(CHANGELOG_PATH, 'utf8');

        // Update the first changelog version
        content = content.replace(
            /version: ['"][\d.]+['"]/,
            `version: '${version}'`
        );

        // Update the date
        const today = new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
        content = content.replace(
            /date: ['"][^'"]+['"]/,
            `date: '${today}'`
        );

        writeFileSync(CHANGELOG_PATH, content, 'utf8');
        console.log(`✅ ChangelogModal: Updated to ${version} (${today})`);

        return true;
    } catch (error) {
        console.error('⚠️  Could not update ChangelogModal:', error.message);
        return false;
    }
}

// Main execution
console.log('\n🚀 Auto Version Increment\n');

const newVersion = updateAppTsx();
if (newVersion) {
    updateCapacitorConfig(newVersion);
    updateChangelog(newVersion);
    console.log(`\n✨ Version bumped to ${newVersion}\n`);
} else {
    console.error('\n❌ Version increment failed\n');
    process.exit(1);
}
