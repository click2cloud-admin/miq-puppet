const mkdirp = require('mkdirp');
const puppeteer = require('puppeteer-core');
const untildify = require('untildify');
const { promisify } = require('util');

const SERVER = 'http://localhost:3000';
const LOGIN = ['admin', 'smartvm'];
const OUTPUT = '~/miq-puppet-screenshots';


function logRequest(req) {
  const url = req.url();

  // skip assets
  if (url.match(/\?body=1$/))
    return;
  // skip webpack packs
  if (url.match(/3000\/packs/))
    return;
  // skip fonts, custom css, images
  if (url.match(/\.(css|svg|ico|png|woff2)/))
    return;

  console.log('REQUEST: ', url);
}

function logConsole(msg) {
  const text = msg.text();
  const type = msg.type();

  // hide info and debug level
  if (type === 'info' || type === 'debug')
    return;

  console.log('PAGE LOG:', text);
}

async function login(page, user, pass) {
  await page.goto(SERVER + '/dashboard/login');

  const userEl = await page.$('#user_name');
  const passEl = await page.$('#user_password');
  const loginEl = await page.$('#login');

  await userEl.type(user);
  await passEl.type(pass);

  await loginEl.click();
  await page.waitForNavigation();
}

async function menuItems(page) {
  return page.evaluate(() => {
    function children(parent, ...selectors) {
      if (! parent)
        return [];

      const [selector, ...rest] = selectors;
      const items = [];
      parent.querySelectorAll(':scope > li > a').forEach((el) => {
        items.push({
          href: el.href,
          title: el.innerText,
          items: children(el.parentElement.querySelector(`${selector} > ul`), ...rest),
        });
      });

      return items;
    }

    return children(document.querySelector('#maintab'), '.nav-pf-secondary-nav', '.nav-pf-tertiary-nav');
  });
}

async function screenshot(page, name) {
  await promisify(mkdirp)(untildify(OUTPUT));

  await page.screenshot({
    path: `${untildify(OUTPUT)}/${name}.png`,
  });

  console.log('SCREENSHOT', `${untildify(OUTPUT)}/${name}.png`);
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/usr/bin/chromium',
//    headless: false,
//    devtools: true,
  });

  const page = await browser.newPage();
  page.on('console', logConsole);
  page.on('request', logRequest);

  await login(page, ...LOGIN);

  const menu = await menuItems(page);
  console.log('menu', menu);

  await screenshot(page, 'foobar');

  await browser.close();
})();
