import fs from 'fs';
import path from 'path';
import StyleDictionary from 'style-dictionary';
import { fileURLToPath } from 'url';
import sdConfig from './config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the source tokens file
const tokensPath = path.resolve(__dirname, 'raw-tokens.json');
// Directory where split tokens will be saved
const outputDir = path.resolve(__dirname, 'tokens');

// Clean output directory
if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Read and parse the tokens file
const rawData = fs.readFileSync(tokensPath, 'utf-8');
const tokens = JSON.parse(rawData);

// Function to recursively create directories and write files
function toKebabCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function toCamelCase(str) {
    return str
        .replace(/^([A-Z])/, (m) => m.toLowerCase()) // Lowercase first char
        .replace(/[-_\s]+(\w)/g, (_, c) => c.toUpperCase()); // Convert -x, _x, or space x to X
}

function writeTokens(obj, currentPath) {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            // Exclude keys starting with $ (metadata)
            if (key.startsWith('$')) {
                continue;
            }

            // Split key by slash to handle nested file structure
            // Example: "Primitives/MarsUI" -> parts=["Primitives", "MarsUI"]
            const parts = key.split('/');
            const originalFileName = parts.pop();

            // Apply kebab-case to directory parts
            const dirParts = parts.map(toKebabCase);
            const dirPath = path.join(currentPath, ...dirParts);

            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            // Apply camelCase to filename
            const fileName = toCamelCase(originalFileName);
            const filePath = path.join(dirPath, `${fileName}.json`);

            // Use the content directly, DO NOT wrap in fileName key.
            // This ensures tokens defined inside the object (e.g. "Font") are explicitly at the root
            // when Style Dictionary merges the file.
            fs.writeFileSync(filePath, JSON.stringify(obj[key], null, 2));
            console.log(`Created ${filePath}`);
        }
    }
}

console.log('Splitting tokens...');
writeTokens(tokens, outputDir);

console.log('Running Style Dictionary...');

const finalConfig = { ...sdConfig };

finalConfig.platforms = finalConfig.platforms || {};

finalConfig.platforms.debug = {
    transformGroup: 'android',
    buildPath: 'build/debug/',
    files: [{
        destination: 'tokens.json',
        format: 'debug'
    }]
};

finalConfig.platforms.android = {
    transformGroup: 'android',
    buildPath: 'build/android/',
    files: [{
        destination: 'colors.xml',
        format: 'custom/android/colors',
        filter: 'isColor'
    }, {
        destination: 'font_dimens.xml',
        format: 'custom/android/dimens',
        filter: 'isDimension'
    }]
};

const sdInstance = new StyleDictionary(finalConfig);

sdInstance.registerFormat({
    name: 'debug',
    format: function ({ dictionary }) {
        return dictionary.allTokens.map(token => {
            return JSON.stringify({
                path: token.path,
                type: token.type,
                value: token.value,
                attributes: token.attributes,
                original: token.original
            }, null, 2);
        }).join('\n');
    }
});

sdInstance.registerFilter({
    name: 'isColor',
    filter: function (token) {
        return token.type === 'color';
    }
});

sdInstance.registerFilter({
    name: 'isDimension',
    filter: function (token) {
        return token.type === 'dimension' || token.attributes.category === 'Font' || token.type === 'number';
    }
});

sdInstance.registerFormat({
    name: 'custom/android/colors',
    format: function ({ dictionary }) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<resources>\n' +
            dictionary.allTokens.map(token => {
                return `  <color name="${token.name}">${token.value}</color>`;
            }).join('\n') +
            '\n</resources>';
    }
});

sdInstance.registerFormat({
    name: 'custom/android/dimens',
    format: function ({ dictionary }) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<resources>\n' +
            dictionary.allTokens.map(token => {
                return `  <dimen name="${token.name}">${token.value}dp</dimen>`;
            }).join('\n') +
            '\n</resources>';
    }
});

await sdInstance.buildAllPlatforms();
console.log('Build completed!');
