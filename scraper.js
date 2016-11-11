var cheerio = require('cheerio');
var request = require('request');
var args = require('command-line-args');
var usage = require('command-line-usage');
var moment = require('moment');
var GoogleSpreadsheet = require('google-spreadsheet');

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
        name: 'save',
        alias: 's',
        type: String,
        typeLabel: '[underline]{sheet id}',
        description: 'Publish results to this google spreadsheet. Sheet must have columns named "Recorded", "Effective Date", and "Fund Value".'
    },
    {
        name: 'key',
        alias: 'k',
        type: String,
        typeLabel: '[underline]{fileName}',
        description: 'The JSON auth key for your google API service account'
    },
    {
        name: 'verbose',
        alias: 'v',
        type: Boolean,
        description: 'Display additional progress information'
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

if(options.help || !options.organisation || !options.username || !options.password || (options.save && !options.key)) {
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
    if(options.verbose) { console.log('Requesting login page'); }
    request.get('/Login.aspx', scrapeLoginPage);
}

function scrapeLoginPage(error, response, body) {
    if(error)
        throw error;

    if(options.verbose) { console.log('Processing login page'); }

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

    if(options.verbose) { console.log('Logging in'); }

    request.post('/Login.aspx', { form: formData }, scrapeHomePage);
}

function scrapeHomePage(error, response, body) {
    if(error)
        throw error;

    if(options.verbose) { console.log('Logged in, processing home page'); }

    var $ = cheerio.load(body);

    var href = '';
    $('a').each(function() {
        if($(this).attr('title') === 'My Workplace Pension') {
            href=$(this).attr('href').replace('/' + options.organisation, '');
        }
    });

    if(options.verbose) { console.log('Requesting pensions details page'); }

    request.get(href, scrapeDetailsPage);
}

function scrapeDetailsPage(error, response, body) {
    if(error)
        throw error;

    if(options.verbose) { console.log('Processing pension details page'); }

    var $ = cheerio.load(body);

    var fundValue = '';

    var effectiveDate = '';

    $('h3').each(function() {
        var h3 = $(this);

        if(h3.html().indexOf('&#xA3;') === 0)
            fundValue = h3.html().replace('&#xA3;', '').replace(',','');

        if(h3.html().indexOf('Effective as at:' === 0))
            effectiveDate = h3.html().replace('Effective as at: ', '');
    });

    if(options.verbose) { console.log('Fund value found: '); }

    console.log(effectiveDate + ': ' + fundValue);

    if(options.save) {
        publishToGoogleSheets(fundValue, effectiveDate);
    }
}

function publishToGoogleSheets(value, effectiveDate) {
    var doc = new GoogleSpreadsheet(options.save);
    var sheet;
    var creds = require(options.key);
    doc.useServiceAccountAuth(creds, function(error) {
        if(error)
            throw error;
        
        doc.getInfo(function(error, info) {
            if(error)
                throw error;

            doc.addRow(1, { 'Recorded': moment().format('DD/MM/YYYY HH:mm'), 'Effective Date': effectiveDate, 'Fund Value': value }, function(error, info) {
                if(error)
                    throw error;

                console.log('Successfully published to: ' + info.title);
            });
        });

    });
}
