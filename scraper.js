var cheerio = require('cheerio');
var request = require('request');
var args = require('command-line-args');
var usage = require('command-line-usage');

var baseUrl = 'https://ae.nowpensions.com/';

var optionDefinitions = [
    { 
        name: 'organisation',
        alias: 'o',
        type: String,
        typeLabel: '[underline]{code}',
        description: 'The code for your organisation.'
    },
    {
        name: 'username',
        alias: 'u',
        type: String,
        typeLabel: '[underline]{username}',
        description: 'Your Now Pensions account username.'
    },
    { 
        name: 'password',
        alias: 'p',
        type: String,
        typeLabel: '[underline]{password}',
        description: 'Your Now Pensions account password.'
    },
    {
        name: 'help',
        alias: 'h',
        type: Boolean, 
        description: 'Displays this usage information.'
    }
];

var sections = [
    {
        header: 'Now Pensions Scraper',
        content: 'Automates the process of logging in to the Now Pensions website to retrieve your fund value'
    },
    {
        header: 'Options',
        optionList: optionDefinitions
    }
];

var options = args(optionDefinitions);
var usage = usage(sections);

if(options.help || !options.organisation || !options.username || !options.password ) {
    console.log(usage);
    process.exit();
}

request = request.defaults({
    followAllRedirects: true,
    jar: true,
    baseUrl: 'https://ae.nowpensions.com/' + options.organisation
});

getLoginPage();

function getLoginPage() {
    request.get('/Login.aspx', scrapeLoginPage);
}

function scrapeLoginPage(error, response, body) {
    if(error)
        throw error;

    var $ = cheerio.load(body);

    var $form = $('#aspnetForm');

    var formData = {
        'ctl01$ctl00$SiteContentPlaceHolder$ContentMainBody$ctlLogin$Login': 'Login'
    };

    $form.find('input').each(function() {
        var input = $(this);
        var name = input.attr('name');
        var type = input.attr('type');

        if(type === 'submit')
            return;

        //if name or password, put in the right values, otherwise copy blindly
        if(name.indexOf('UserName') !== -1) {
            formData[name] = options.username;
        } else if(name.indexOf('Password') !== -1) {
            formData[name] = options.password;
        } else {
            formData[name] = input.attr('value');
        }
    });

    login(formData);
}

function login(data) {
    request.post('/Login.aspx', { form: data }, scrapeHomePage);
}

function scrapeHomePage(error, response, body) {
    if(error)
        throw error;

    var $ = cheerio.load(body);

    var href = '';
    $('a').each(function() {
        if($(this).attr('title') === 'My Workplace Pension') {
            href=$(this).attr('href').replace('/' + options.organisation, '');
        }
    });
    
    request.get(href, scrapeDetailsPage);
}

function scrapeDetailsPage(error, response, body) {
    if(error)
        throw error;

    var $ = cheerio.load(body);

    var fundValue = '';
    $('h3').each(function() {
        var h3 = $(this);

        if(h3.html().indexOf('&#xA3;') === 0)
            fundValue = h3.html().replace('&#xA3;', '');
    });

    console.log(fundValue.replace(',',''));
}
