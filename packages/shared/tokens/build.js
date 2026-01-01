const fs = require('fs');
const path = require('path');
const StyleDictionary = require('style-dictionary');

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
const sdConfig = require('./config.json');

// ADDED DEBUGGING
StyleDictionary.registerFormat({
    name: 'debug',
    formatter: function ({ dictionary }) {
        const output = dictionary.allTokens.map(token => {
            return JSON.stringify({
                path: token.path,
                type: token.type,
                value: token.value,
                attributes: token.attributes,
                original: token.original
            }, null, 2);
        }).join('\n');
        return output;
    }
});

sdConfig.platforms.debug = {
    transformGroup: 'android',
    buildPath: 'build/debug/',
    files: [{
        destination: 'tokens.json',
        format: 'debug'
    }]
};

// Register custom filters
StyleDictionary.registerFilter({
    name: 'isColor',
    matcher: function (token) {
        return token.type === 'color';
    }
});

StyleDictionary.registerFilter({
    name: 'isDimension',
    matcher: function (token) {
        return token.type === 'dimension' || token.attributes.category === 'Font' || token.type === 'number'; // expanded for dimensions
    }
});

// Custom Formatters
StyleDictionary.registerFormat({
    name: 'custom/android/colors',
    formatter: function ({ dictionary }) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<resources>\n' +
            dictionary.allTokens.map(token => {
                return `  <color name="${token.name}">${token.value}</color>`;
            }).join('\n') +
            '\n</resources>';
    }
});

StyleDictionary.registerFormat({
    name: 'custom/android/dimens',
    formatter: function ({ dictionary }) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<resources>\n' +
            dictionary.allTokens.map(token => {
                return `  <dimen name="${token.name}">${token.value}dp</dimen>`; // Assuming dp for now or use original unit
            }).join('\n') +
            '\n</resources>';
    }
});


// Update Android config to use custom filters
sdConfig.platforms.android = {
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


const sd = StyleDictionary.extend(sdConfig);
sd.buildAllPlatforms();
console.log('Build completed!');
