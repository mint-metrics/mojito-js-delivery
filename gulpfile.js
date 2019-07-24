const gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    del = require('del'),
    concat = require('gulp-concat'),
    awspublish = require('gulp-awspublish'),
    yaml = require('gulp-yaml'),
    addsrc = require('gulp-add-src'),
    modularBuild = require('./modular-build'),
    config = require('./config'),
    mochaPhantomJS = require('gulp-mocha-phantomjs');

// parsing extra arguments from process.argv
const getCLIArgs = () =>
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
            args[curOpt] = true;
        }
    }

    return args;
};

gulp.task('test', function ()
{
    gulp.src('tests/test_suite.html')
        .pipe(mochaPhantomJS({reporter: 'spec', dump: 'test.log'}));

});

gulp.task('scripts', function ()
{
    del(['dist/assets/js']);
    let containerName = config.containerName;
    gulp.src('lib/waves/**/config.yml')
        .pipe(yaml())
        .pipe(modularBuild())
        .pipe(concat('test-objects.js'))
        .pipe(addsrc.append(['lib/waves/**/test-object.js']))
        .pipe(addsrc.prepend(['license.txt', 'lib/mojito.js', 'lib/shared-code.js']))
        .pipe(concat(containerName + '.pretty.js'))
        .pipe(gulp.dest('dist/assets/js'))
        .pipe(uglify())
        .pipe(addsrc.prepend(['license.txt']))
        .pipe(concat(containerName + '.js'))
        .pipe(gulp.dest('dist/assets/js'));
});

gulp.task("publish", function ()
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
            .pipe(awspublish.gzip())
            .pipe(publisher.publish(headers, { force: true }))
            .pipe(awspublish.reporter())
    );
});
