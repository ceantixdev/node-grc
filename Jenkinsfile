def notify(status){
	emailext (
		body: '$DEFAULT_CONTENT',
		recipientProviders: [
			[$class: 'CulpritsRecipientProvider'],
			[$class: 'DevelopersRecipientProvider'],
			[$class: 'RequesterRecipientProvider']
		],
		replyTo: '$DEFAULT_REPLYTO',
		subject: '$DEFAULT_SUBJECT',
		to: '$DEFAULT_RECIPIENTS'
	)
}

@NonCPS
def killall_jobs() {
	def jobname = env.JOB_NAME;
	def buildnum = env.BUILD_NUMBER.toInteger();
	def killnums = "";
	def job = Jenkins.instance.getItemByFullName(jobname);
	def split_job_name = env.JOB_NAME.split(/\/{1}/);
	def fixed_job_name = split_job_name[1].replace('%2F',' ');

	for (build in job.builds) {
		if (!build.isBuilding()) { continue; }
		if (buildnum == build.getNumber().toInteger()) { continue; println "equals"; }
		if (buildnum < build.getNumber().toInteger()) { continue; println "newer"; }

		echo("Kill task = ${build}");

		killnums += "#" + build.getNumber().toInteger() + ", ";

		build.doStop();
	}

	if (killnums != "") {
		discordSend description: "in favor of #${buildnum}, ignore following failed builds for ${killnums}", footer: "", link: env.BUILD_URL, result: "ABORTED", title: "[${split_job_name[0]}] Killing task(s) ${fixed_job_name} ${killnums}", webhookURL: env.GS2EMU_WEBHOOK
	}
	echo("Done killing");
}

def buildStepDocker() {
	def split_job_name = env.JOB_NAME.split(/\/{1}/);
	def fixed_job_name = split_job_name[1].replace('%2F',' ');

	def customImage = docker.image("node:22-alpine");
	customImage.pull();

	try {
		def buildenv = "";
		def tag = '';
		def VER = '';
		def EXTRA_VER = '';


		if(env.TAG_NAME) {
			sh(returnStdout: true, script: "echo '```' > RELEASE_DESCRIPTION.txt");
			env.RELEASE_DESCRIPTION = sh(returnStdout: true, script: "git tag -l --format='%(contents)' ${env.TAG_NAME} >> RELEASE_DESCRIPTION.txt");
			sh(returnStdout: true, script: "echo '```' >> RELEASE_DESCRIPTION.txt");
		}

		if (env.BRANCH_NAME.equals('main')) {
			tag = "latest";
		} else {
			tag = "${env.BRANCH_NAME.replace('/','-')}";
		}

		if (env.TAG_NAME) {
			EXTRA_VER = "";
			VER = "${env.TAG_NAME}";
		} else if (env.BRANCH_NAME.equals('dev')) {
			EXTRA_VER = "-beta";
		} else {
			EXTRA_VER = "--build-arg VER_EXTRA=-${tag}";
		}

		docker.withRegistry("https://index.docker.io/v1/", "dockergraal") {
			def release_name = env.JOB_NAME.replace('%2F','/');
			def release_type = ("${release_name}").replace('/','-').replace('node-grc-','').replace('main','').replace('dev','');

			stage("Building npm package") {
				customImage.inside("-u 0") {
					sh("chmod 777 -R .");
					sh("npm install");
					sh("npm version ${VER}");
					sh("npx tsc");
					sh("chmod 777 -R .");
				}
			}

			def archive_date = sh (
				script: 'date +"-%Y%m%d-%H%M"',
				returnStdout: true
			).trim();

			if (env.TAG_NAME) {
				archive_date = '';
			}

			if (env.TAG_NAME) {
				stage("Pushing npm package") {
					customImage.inside("-u 0") {
						withCredentials([string(credentialsId: 'PREAGONAL_GITHUB_TOKEN', variable: 'NPM_CONFIG_TOKEN')]) {
							sh("npm ci");
							sh("npm publish --access public");
							discordSend description: "NPM Successful", footer: "", link: env.BUILD_URL, result: currentBuild.currentResult, title: "[${split_job_name[0]}] Artifact Successful: ${fixed_job_name} #${env.BUILD_NUMBER}", webhookURL: env.GS2EMU_WEBHOOK;
						}
					}
				}
			}
		}
	} catch(err) {
		currentBuild.result = 'FAILURE'
		customImage.inside("-u 0") {
			sh("chmod 777 -R .");
		}
		discordSend description: "", footer: "", link: env.BUILD_URL, result: currentBuild.currentResult, title: "[${split_job_name[0]}] Build Failed: ${fixed_job_name} #${env.BUILD_NUMBER}", webhookURL: env.GS2EMU_WEBHOOK

		notify("Build Failed: ${fixed_job_name} #${env.BUILD_NUMBER}")
		throw err
	}
}

node('master') {
killall_jobs();
	def split_job_name = env.JOB_NAME.split(/\/{1}/);
	def fixed_job_name = split_job_name[1].replace('%2F',' ');
	checkout(scm);

	env.COMMIT_MSG = sh(
		script: 'git log -1 --pretty=%B ${GIT_COMMIT}',
		returnStdout: true
	).trim();

	env.GIT_COMMIT = sh(
		script: 'git log -1 --pretty=%H ${GIT_COMMIT}',
		returnStdout: true
	).trim();

	sh('git fetch --tags');

	env.LATEST_TAG = sh(
		script: 'git tag -l | tail -1',
		returnStdout: true
	).trim();

	echo("Latest tag: ${env.LATEST_TAG}");

	def version = env.LATEST_TAG.split(/\./);

	echo("Version: ${version}");

	def verMajor = version[0] as Integer;
	def verMinor = version[1] as Integer;
	def verPatch = version[2] as Integer;
	def versionChanged = false;

	echo("Version - Major: ${verMajor}, Minor: ${verMinor}, Patch: ${verPatch}");

	if (env.BRANCH_NAME.equals('main')) {
		verMinor++;
		verPatch = 0;
		versionChanged = true;
	} else if (env.BRANCH_NAME.equals('dev')) {
		verPatch++;
		versionChanged = true;
	}

	if (versionChanged) {
		withCredentials([string(credentialsId: 'PREAGONAL_GITHUB_TOKEN', variable: 'GITHUB_TOKEN')]) {
			def tagName = "${verMajor}.${verMinor}.${verPatch}";

			def iso8601Date = sh(
				script: 'date -Iseconds',
				returnStdout: true
			).trim();

			env.JSON_RESPONSE = sh(
				script: "curl -L -X POST -H \"Accept: application/vnd.github+json\" -H \"Authorization: Bearer ${env.GITHUB_TOKEN}\" -H \"X-GitHub-Api-Version: 2022-11-28\" https://api.github.com/repos/xtjoeytx/node-grc/git/tags -d '{\"tag\":\"${tagName}\",\"message\":\"${env.COMMIT_MSG}\",\"object\":\"${env.GIT_COMMIT}\",\"type\":\"tree\",\"tagger\":{\"name\":\"preagonal-pipeline[bot]\",\"email\":\"119898225+preagonal-pipeline[bot]@users.noreply.github.com\",\"date\":\"${iso8601Date}\"}}'",
				returnStdout: true
			);
			def response = readJSON(text: env.JSON_RESPONSE);

			sh(
				script: "curl -L -X POST -H \"Accept: application/vnd.github+json\" -H \"Authorization: Bearer ${env.GITHUB_TOKEN}\" -H \"X-GitHub-Api-Version: 2022-11-28\" https://api.github.com/repos/xtjoeytx/node-grc/git/refs -d '{\"ref\": \"refs/tags/${tagName}\", \"sha\": \"${response.sha}\"}'",
				returnStdout: true
			);
		}
	}

	discordSend description: "${env.COMMIT_MSG}", footer: "", link: env.BUILD_URL, result: currentBuild.currentResult, title: "[${split_job_name[0]}] Build Started: ${fixed_job_name} #${env.BUILD_NUMBER}", webhookURL: env.GS2EMU_WEBHOOK

	if (env.TAG_NAME) {
		sh(returnStdout: true, script: "echo '```' > RELEASE_DESCRIPTION.txt");
		env.RELEASE_DESCRIPTION = sh(returnStdout: true, script: "git tag -l --format='%(contents)' ${env.TAG_NAME} >> RELEASE_DESCRIPTION.txt");
		sh(returnStdout: true, script: "echo '```' >> RELEASE_DESCRIPTION.txt");
	}

	buildStepDocker();

	if (env.TAG_NAME) {
		//def DESC = sh(returnStdout: true, script: 'cat RELEASE_DESCRIPTION.txt');
	}

	sh("rm -rf ./*");
}