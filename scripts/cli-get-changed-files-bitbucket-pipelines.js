const execSync = require('child_process').execSync;
const fs = require('fs');
const config = require('../config');

function runGitLog(lastCommitHash, currentCommitHash) {
    if (lastCommitHash) {
        execSync('git log --name-only --format="" ' + lastCommitHash + '..' + currentCommitHash + ' >> /etc/mojito-changed-files.txt');
        fs.writeFileSync('/etc/mojito-comparing-commits.txt', lastCommitHash + '...' + currentCommitHash);
    } else {
        execSync('git log --name-only --format="" ' + currentCommitHash + ' >> /etc/mojito-changed-files.txt');
        fs.writeFileSync('/etc/mojito-comparing-commits.txt', currentCommitHash);
    }
}

async function getLastBuildTime(args) {
    let branch = 'master';
    if (config.lifecycleEvents.ci && config.lifecycleEvents.ci.branch) {
        branch = config.lifecycleEvents.ci.branch;
    }

    let url = `https://api.bitbucket.org/2.0/repositories/${args.workspace}/${args.repoSlug}/pipelines/?status=PASSED&status=SUCCESSFUL&target.ref_name=${branch}&sort=-created_on`;
    let res = await fetch(url, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${args.repoAccessToken}`
        }
    });

    if (res.ok) {
        let data = await res.json();
        if (data.values.length) {
            let lastPipeline = data.values[0];
            runGitLog(lastPipeline.target.commit.hash, args.commitHash);
        } else {
            runGitLog(null, args.commitHash);
        }
    } else {
        throw new Error(`Mojito Building - get pipeline data failed.`);
    }
}

module.exports = async function getChangedFiles(args) {
	getLastBuildTime(args);
};