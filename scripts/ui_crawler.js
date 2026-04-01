import puppeteer from 'puppeteer';

const pagesToVisit = [
    '/',
    '/dashboard',
    '/overview',
    '/planner',
    '/operator',
    '/quality',
    '/settings',
    '/workflows',
    '/brochure',
    '/designer',
    '/factory-map'
];

async function run() {
    console.log('Starting UI Crawler for MES App on http://localhost:3000');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`[PAGE ERROR] ${msg.text()}`);
        }
    });

    const report = [];

    for (const p of pagesToVisit) {
        const url = `http://localhost:3000${p}`;
        console.log(`\nVisiting: ${url}`);
        try {
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
            if (!response || !response.ok()) {
                console.log(`❌ Failed to load ${url} - Status: ${response ? response.status() : 'Unknown'}`);
                report.push({ page: p, status: 'Error', details: 'Page failed to load.' });
                continue;
            }

            const pageData = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const links = Array.from(document.querySelectorAll('a'));
                const tables = Array.from(document.querySelectorAll('table'));
                const lists = Array.from(document.querySelectorAll('ul, ol'));
                const pageText = document.body.innerText;
                const hasEmptyState = pageText.includes('No data') || pageText.includes('0 items') || pageText.includes('No results');

                const buttonTexts = buttons.map(b => b.innerText.trim()).filter(t => t);
                const brokenLinks = links.filter(l => l.getAttribute('href') === '#' || l.getAttribute('href') === '').map(l => l.innerText.trim());

                return {
                    buttonCount: buttons.length,
                    linkCount: links.length,
                    tableCount: tables.length,
                    listCount: lists.length,
                    hasEmptyState,
                    buttonTexts: buttonTexts.slice(0, 10),
                    brokenLinks: brokenLinks.slice(0, 10),
                    textLength: pageText.length
                };
            });

            console.log(`✅ Loaded ${p}`);
            console.log(`   - Buttons: ${pageData.buttonCount}`);
            console.log(`   - Tables: ${pageData.tableCount}`);
            console.log(`   - Lists: ${pageData.listCount}`);
            console.log(`   - Has empty state text: ${pageData.hasEmptyState}`);
            if (pageData.brokenLinks.length > 0) {
                console.log(`   - Warning: Found empty href links: ${pageData.brokenLinks.join(', ')}`);
            }

            if (pageData.buttonCount > 0) {
                try {
                    await page.evaluate(() => {
                        const btn = document.querySelector('button');
                        if (btn) btn.click();
                    });
                    await new Promise(r => setTimeout(r, 500));
                } catch (e) {
                    console.log(`   - Error clicking button: ${e.message}`);
                }
            }

            report.push({
                page: p,
                status: 'Success',
                stats: pageData
            });

        } catch (error) {
            console.log(`❌ Error visiting ${url}: ${error.message}`);
            report.push({ page: p, status: 'Error', details: error.message });
        }
    }

    await browser.close();

    console.log('\n--- UI Test Summary ---');
    report.forEach(r => {
        if (r.status === 'Success') {
            console.log(`[${r.page}]: OK | Tables: ${r.stats.tableCount} | EmptyState: ${r.stats.hasEmptyState}`);
        } else {
            console.log(`[${r.page}]: FAILED | ${r.details}`);
        }
    });

    console.log('\nDone.');
}

run();
