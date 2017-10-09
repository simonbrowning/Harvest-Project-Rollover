const createServiceProject = require('../actions/createServiceProject.js'),
	getPreviousHours = require('../utils/getPreviousHours.js'),
	getProjectHours = require('../utils/getProjectHours.js'),
	sendRequest = require('../actions/sendRequest.js'),
	_ = require('underscore'),
	moment = require('moment'),
	findProject = require('../utils/findProject'),
	log = require('../actions/logging.js');

process.env.log = 'monthly';
const last_month = moment()
	.subtract(1, 'months')
	.format('YYYY-MM');
function processProjects(projects) {
	log.info(`projects in response ${projects.length}`);
	return new Promise(function(resolve, reject) {
		let promises = projects.map(function({ project }) {
			return new Promise(function(resolve, reject) {
				let pid,
					new_project = {},
					new_pid,
					exists;
				//Check if project has a date YYYY-MM at the end of the project and is active
				if (
					_.has(project, 'name') &&
					project.name.endsWith(last_month) &&
					project.active
				) {
					pid = project.id;
					log.info(`${pid} project to process`);
					//Set new project name
					new_project.client_id = project.client_id;
					new_project.name =
						project.name.match(/(.+)\d{4}\-\d{2}$/)[1] +
						moment().format('YYYY-MM');
					exists = findProject(projects, project.client_id, new_project.name);
					if (exists) {
						log.info(`${pid} new project already exists`);
						resolve();
					} else {
						getPreviousHours(project.id, 1, 1).then(function(hours_used) {
							let hours = getProjectHours(project);

							let excess_hours,
								remaining_hours,
								remaining_bucket = /remaining\_bucket\:(\d+)/.test(
									project.notes
								)
									? parseInt(project.notes.match(/remaining\_bucket\:(\d+)/)[1])
									: null;
							if (hours_used > hours.monthly_hours) {
								excess_hours = hours_used - hours.monthly_hours;
								remaining_hours =
									(remaining_bucket || hours.client_bucket) - excess_hours;
								remaining_bucket = remaining_hours < 0 ? 0 : remaining_hours;
							} else {
								remaining_bucket = remaining_bucket || hours.client_bucket;
							}
							new_project.estimate = parseInt(
								remaining_bucket + hours.monthly_hours
							);
							new_project.budget = new_project.estimate;
							new_project.notes = `client_hours:${hours.monthly_hours};client_bucket:${hours.client_bucket};remaining_bucket:${remaining_bucket}`;
							new_project.budget_by = 'project';
							new_project.billable = true;

							createServiceProject(new_project, project)
								.then(resolve)
								.catch(reject);
						});
					}
				} else {
					resolve();
				}
			});
		}); //map

		Promise.all(promises)
			.then(resolve)
			.catch(reject);
	});
} //processProjects

sendRequest('GET', { path: '/projects' })
	.then(processProjects)
	.then(function() {
		log.info('monthlyRolloverJob has finished');
		log.close();
		process.exit(0);
	})
	.catch(function(err) {
		log.error('Something failed: ' + err);
	});
