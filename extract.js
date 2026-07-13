const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('cinocode_chat.html', 'utf8');
const $ = cheerio.load(html, { recognizeSelfClosing: true, decodeEntities: false, xmlMode: false, sourceCodeLocationInfo: true });

if (!fs.existsSync('assets')) fs.mkdirSync('assets');
if (!fs.existsSync('assets/js')) fs.mkdirSync('assets/js');
if (!fs.existsSync('assets/css')) fs.mkdirSync('assets/css');

let styleCount = 0;
$('style').each((i, el) => {
    const content = $(el).html();
    if (content.length > 50000) {
        fs.writeFileSync('assets/css/main.css', content);
        $(el).replaceWith('<link rel=\"stylesheet\" href=\"assets/css/main.css\">');
        styleCount++;
    }
});

let scriptCount = 0;
$('script:not([src])').each((i, el) => {
    const content = $(el).html();
    if (content.length > 400000) {
        fs.writeFileSync('assets/js/main.js', content);
        $(el).replaceWith('<script src=\"assets/js/main.js\"></script>');
        scriptCount++;
    } else if (content.length > 40000) {
        fs.writeFileSync('assets/js/sinavkocu.js', content);
        $(el).replaceWith('<script src=\"assets/js/sinavkocu.js\"></script>');
        scriptCount++;
    } else if (content.length > 10000 && content.includes('professionsList')) {
        fs.writeFileSync('assets/js/professions.js', content);
        $(el).replaceWith('<script src=\"assets/js/professions.js\"></script>');
        scriptCount++;
    }
});

fs.writeFileSync('cinocode_chat.html', $.html());
console.log('Extracted ' + styleCount + ' styles and ' + scriptCount + ' scripts.');
