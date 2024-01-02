const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');

async function putContainerFile (production, s3Client, minified) {
    let distPath = path.join(process.cwd(), 'dist', 'assets', 'js'),
        fileName = minified?(config.containerName + '.js'):(config.containerName + '.pretty.js'),
        targetFile = path.join(distPath, fileName),
        bucketParts = (production?config.s3BucketPRD:config.s3BucketDev).split('/'),
        bucket = bucketParts[0],
        folder = '';

    if (bucket.length > 1) {
        folder = bucketParts.slice(1).join('/') + '/';
    }

    let gzipContent = zlib.gzipSync(fs.readFileSync(targetFile, 'utf8'), { ext: '' });
    let uploadParams = {
        Bucket: bucket,
        Key: folder + config.containerName + (minified?'.js':'.pretty.js'),
        ContentType: 'application/javascript; charset=utf-8',
        CacheControl: 'max-age=300, public,must-revalidate,s-maxage=300',
        ContentEncoding: 'gzip',
        Body: gzipContent
    }

    let command = new PutObjectCommand(uploadParams);

    try {
        await s3Client.send(command);
        console.log('Published: ./dist/assets/js/' + fileName);
    } catch (error) {
        console.log('Publish failed: ./dist/assets/js/' + fileName);
        throw error;
    }
}

module.exports = async function publish(args) {
    let publisherOptions = {
        region: config.s3Region
    };

    if (args.awsk && args.awss) {
        publisherOptions.accessKeyId = args.awsk;
        publisherOptions.secretAccessKey = args.awss;
    }

    let client = new S3Client(publisherOptions);
    putContainerFile(args.production, client, false);
    putContainerFile(args.production, client, true);
};
