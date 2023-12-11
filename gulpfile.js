const gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    del = require('del'),
    concat = require('gulp-concat'),
    awspublish = require('gulp-awspublish'),
    yaml = require('gulp-yaml'),
    addsrc = require('gulp-add-src'),
    modularBuild = require('./scripts/modular-build'),
    fs = require('fs'),
    through = require('through2'),
    zlib = require('zlib'),
    babel = require('gulp-babel'),
    newCli = require('./scripts/cli-new'),
    setCli = require('./scripts/cli-set'),
    ssaCli = require('./scripts/cli-ssa'),
    runTests = require('./scripts/run-tests')
    parallelize = require('concurrent-transform');
    
// Check whether config exists & create it if not.
for (const file of ['config.js', 'lib/shared-code.js'])
{
    !fs.existsSync(file) && 
    fs.existsSync(file.replace('.js', '.example.js')) && 
    fs.copyFileSync(file.replace('.js', '.example.js'), file);
}
const config = require('./config');

// parsing extra arguments from process.argv
const getCLIArgs = (defaultNull) =>
{
    let argList = process.argv;
    let args = {}, i, opt, thisOpt, curOpt;
    for (i = 0; i < argList.length; i++)
    {
        thisOpt = argList[i].trim();
        opt = thisOpt.replace(/^\-+/, '');

        if (opt === thisOpt)
        {
            // argument value
            if (curOpt) 
            {
                args[curOpt] = opt;
            }
            curOpt = null;
        }
        else
        {
            // argument name
            curOpt = opt;
            args[curOpt] = defaultNull?null:true;
        }
    }

    return args;
};

function test()
{
    return runTests();
}

function insertDuplicateContainerCheck(fileName) {
    let content = fs.readFileSync(fileName, 'utf8');
    let position = content.indexOf('Mojito =');
    if (position == -1) {
        position = content.indexOf('Mojito=');
    }

    content = content.substr(0, position) + 'if (!window.Mojito || !Mojito.testObjects || !Object.keys(Mojito.testObjects).length) {' + content.substring(position) + '}';
    fs.writeFileSync(fileName, content);
}

function build()
{
    del(['dist/assets/js']);
    let containerName = config.containerName;
    let modularResult = {liveList: [], stagingList: [], divertList: [], inactive: 0};

    // is there a nuke.lock file?
    const fileName = 'nuke.lock';
	if (fs.existsSync(fileName))
    {
        // generate the container without test objects
        return (
        gulp.src('license.txt')
            .pipe(addsrc.append(['lib/mojito.js', 'lib/shared-code.js']))
            .pipe(concat(containerName + '.pretty.js'))
            .pipe(babel({presets: [['@babel/preset-env', { "modules": false, exclude:['@babel/plugin-transform-typeof-symbol'] }]]}))
            .pipe(gulp.dest('dist/assets/js'))
            .pipe(uglify())
            .pipe(addsrc.prepend(['license.txt']))
            .pipe(concat(containerName + '.js'))
            .pipe(gulp.dest('dist/assets/js'))
            .pipe(through.obj(function(file, enc, callback)
            {
                let gzippedSize = ((zlib.gzipSync(file.contents, {level: 9}).length)/1024).toFixed(2) + ' KB',
                    colorCyan = '\x1b[36m',
                    colorReset = '\x1b[0m';
    
                setTimeout(function(){
                    console.log(
                        `%s${colorCyan}%s${colorReset}%s`,
                        'Mojito container built (', gzippedSize, ')');
                });
                
                callback(null, file);
            }))
            .pipe(through.obj(function(file, enc, callback)
            {
                // add defensive check to prevent Mojito gets loading multi times
                if (!config.allowMultiInstance) {
                    insertDuplicateContainerCheck(`dist/assets/js/${containerName}.js`);
                    insertDuplicateContainerCheck(`dist/assets/js/${containerName}.pretty.js`);
                }

                callback(null, file);
            }))
        );
    }

    return (
    gulp.src('lib/waves/**/config.yml')
        .pipe(yaml())
        .pipe(modularBuild(modularResult))
        .pipe(concat('test-objects.js'))
        .pipe(addsrc.append(['lib/waves/**/test-object.js']))
        .pipe(addsrc.prepend(['license.txt', 'lib/mojito.js', 'lib/shared-code.js']))
        .pipe(concat(containerName + '.pretty.js'))
        .pipe(babel({presets: [['@babel/preset-env', { "modules": false, exclude:['@babel/plugin-transform-typeof-symbol'] }]]}))
        .pipe(gulp.dest('dist/assets/js'))
        .pipe(uglify())
        .pipe(addsrc.prepend(['license.txt']))
        .pipe(concat(containerName + '.js'))
        .pipe(gulp.dest('dist/assets/js'))
        .pipe(through.obj(function(file, enc, callback)
        {
            let gzippedSize = ((zlib.gzipSync(file.contents, {level: 9}).length)/1024).toFixed(2) + ' KB',
                activeTestCount = modularResult.liveList.length + modularResult.divertList.length + modularResult.stagingList.length,
                colorCyan = '\x1b[36m',
                colorReset = '\x1b[0m';

            // use setTimeout to let built result messages display after gulp 'Finished...' message
            setTimeout(function(){
                if (activeTestCount)
                {
                    console.log(
                        `%s${colorCyan}%s${colorReset}%s${colorCyan}%s${colorReset}%s`,
                        'Mojito container built with ', activeTestCount, ' tests (', gzippedSize, '):');
    
                    if (modularResult.liveList.length)
                    {
                        console.log(
                            `%s${colorCyan}%s${colorReset}%s`,
                            '  Live (', modularResult.liveList.length, ') - ' + modularResult.liveList.join(' '));
                    }
    
                    if (modularResult.stagingList.length)
                    {
                        console.log(
                            `%s${colorCyan}%s${colorReset}%s`,
                            '  Staging (', modularResult.stagingList.length, ') - ' + modularResult.stagingList.join(' '));
                    }

                    if (modularResult.divertList.length)
                    {
                        console.log(
                            `%s${colorCyan}%s${colorReset}%s`,
                            '  Diverted (', modularResult.divertList.length, ') - ' + modularResult.divertList.join(' '));
                    }
                }
                else
                {
                    console.log(
                        `%s${colorCyan}%s${colorReset}%s`,
                        'Mojito container built (', gzippedSize, ')');
                }
    
                if (modularResult.inactive)
                {
                    console.log(
                        `%s${colorCyan}%s${colorReset}%s`,
                        '  Inactive (', modularResult.inactive, ')');
                }
            });
            
            callback(null, file);
        }))
        .pipe(through.obj(function(file, enc, callback)
        {
            // add defensive check to prevent Mojito gets loading multi times
            if (!config.allowMultiInstance) {
                insertDuplicateContainerCheck(`dist/assets/js/${containerName}.js`);
                insertDuplicateContainerCheck(`dist/assets/js/${containerName}.pretty.js`);
            }

            callback(null, file);
        }))
    );
}

function publish()
{
    let args = getCLIArgs();
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
    let publisherOptions = {
        region: config.s3Region,
        params: {}
    };

    // production or development? default is development
    if (args.production)
    {
        publisherOptions.params.Bucket = config.s3BucketPRD;
    }
    else
    {
        publisherOptions.params.Bucket = config.s3BucketDev;
    }

    // if accessKeyId and secretAccessKey was passed as command line parameter
    if (args.awsk && args.awss)
    {
        publisherOptions.accessKeyId = args.awsk;
        publisherOptions.secretAccessKey = args.awss;
    }

    let publisher = awspublish.create(publisherOptions);
    // define custom headers
    let headers = {
        "Cache-Control": "max-age=300, public,must-revalidate,s-maxage=300",
        "Content-Encoding": "gzip"
    };

    return (
        gulp.src("dist/assets/js/*.js")
            .pipe(parallelize(awspublish.gzip(), 5))
            .pipe(parallelize(publisher.publish(headers, { force: true }), 5))
            .pipe(awspublish.reporter())
    );
}

function cliNew(cb)
{
    newCli(getCLIArgs(true), cb);
}

function cliSet(cb)
{
    setCli(getCLIArgs(true), cb);
}

function cliSSA(cb)
{
    ssaCli(getCLIArgs(true), cb);
}

exports.test = test;
exports.build = build;
exports.scripts = build;
exports.publish = publish;
exports.default = build;
exports.new = cliNew;
exports.set = cliSet;
exports.ssa = cliSSA;
exports.refresh = gulp.series([build, publish]);
