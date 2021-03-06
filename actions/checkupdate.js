const config = require('../config'),
	sendRequest = require('../actions/sendRequest'),
	getPages = require('../actions/getPages'),
	getTasksAssignment = require('../utils/getTasksAssignment'),
	getUserAssignment = require('../utils/getUserAssignment'),
	processTasks = require('../utils/processTasks'),
	processUsers = require('../utils/processUsers'),
	toggleProject = require('../utils/toggleProject'),
	setPM = require('../utils/setPM'),
	log = require('../actions/logging'),
	addUser = require('../utils/addUser'),
	findUser = require('../utils/findUser'),
	moment = require('moment');

function errorHandle(e) {
	log.warn(`caught rejection: ${e}`);
	return null;
}

module.exports = function() {
	return new Promise(function(resolve, reject) {
		async function callback(projects) {
			let support_project = await sendRequest('GET', {
				path: `/projects/${config.harvestv2.default_project}`
			});

			let harvest_users = await getPages('users');
			log.info(`Total number of users ${harvest_users.length}`);
			let support_tasks = await getTasksAssignment({ old_project: support_project });
			support_tasks = support_tasks.tasks;

			let support_users = await getUserAssignment({ old_project: support_project });
			support_users = support_users.users;

			log.info(`support tasks: ${support_tasks.length}`);
			log.info(`support users: ${support_users.length}`);
			log.info('Looping projects');

			let promises = projects.map(function(project) {
				return new Promise(async function(resolve, reject) {
					if (
						project.is_active &&
						project.name.indexOf("Services") == 0
					) {
						log.info(project.client.name, project.name);
						try {
							let notes = JSON.parse(project.notes);
							let tasks = await getTasksAssignment({ old_project: project });
							tasks = tasks.tasks;

							let users = await getUserAssignment({ old_project: project });
							users = users.users;

							log.info(`${project.client.name}: ${project.id} tasks: ${tasks.length}`);
							log.info(`${project.client.name}: ${project.id} users: ${users.length}`);

							//check AM is assigned and Project Manager
							let account_manager;

							if (notes.account_manager === null || notes.account_manager === null) {
								log.info(`${project.client.name}: ${project.id} no account manager set`);
							} else {
								log.info(`${project.client.name}: ${project.id} find ${notes.account_manager}`);
								account_manager = findUser(users, notes.account_manager);

								if (typeof account_manager !== 'undefined') {
									log.info(
										`${project.client.name}: ${project.id} found Account Manager ${account_manager.user.name}`
									);
									if (account_manager.is_project_manager) {
										log.info(`${project.client.name}: ${project.id} ${account_manager.user.name} is PM`);
									} else {
										log.info(
											`${project.client.name}: ${project.id} ${
												account_manager.user.name
											} not set as PM, updating`
										);
										await setPM(project, account_manager.id);
									}
								} else {
									// log.info(
									// 	`${project.client.name}: ${project.id} lets look in all users for ${
									// 		notes.account_manager
									// 	}`
									// );

									// account_manager = findUser(harvest_users, notes.account_manager);
									// log.info(
									// 	`${project.client.name}: ${project.id} found ${notes.account_manager} - ${
									// 		account_manager.id
									// 	} adding`
									// );

									// let added_user = await addUser(project.id, account_manager.id).catch(errorHandle);
									// if (added_user !== null) {
									// 	log.info(
									// 		`${project.client.name}: ${project.id} added ${notes.account_manager} now making a PM`
									// 	);
									// 	await setPM(project, added_user.id);

									// 	log.info(
									// 		`${project.client.name}: ${project.id} finished adding ${notes.account_manager}`
									// 	);
									// }
								}
							}

							//Work out if the poject has less users / tasks than the Template
							let current_support_users = {},
								users_to_update = [];
							support_users.forEach(function(user) {
								current_support_users[user.user.id] = 1;
							});

							for (usr in users) {
								if (current_support_users[users[usr].user.id]) {
									delete current_support_users[users[usr].user.id];
								}
							}

							for (let id in current_support_users) {
								if (current_support_users.hasOwnProperty(id)) {
									support_users.forEach(function(user) {
										if (user.user.id == id) {
											log.info(`${project.client.name}: ${project.id} user to add: ${user.user.name}`);
											users_to_update.push(user);
										}
									});
								}
							}

							let current_support_tasks = {},
								tasks_to_update = [];
							support_tasks.forEach(function(task) {
								current_support_tasks[task.task.id] = 1;
							});

							for (task in tasks) {
								if (current_support_tasks[tasks[task].task.id]) {
									delete current_support_tasks[tasks[task].task.id];
								}
							}

							for (let id in current_support_tasks) {
								if (current_support_tasks.hasOwnProperty(id)) {
									support_tasks.forEach(function(task) {
										if (task.task.id == id) {
											log.info(`${project.client.name}: ${project.id} task to add: ${task.task.name}`);
											tasks_to_update.push(task);
										}
									});
								}
							}

							if (tasks_to_update.length > 0) {
								log.info(`${project.client.name}: ${project.id} adding missing tasks`);
								await processTasks({
									new_project: project,
									new_pid: project.id,
									tasks: tasks_to_update
								}).catch(errorHandle);
							}

							if (users_to_update.length > 0) {
								log.info(`${project.client.name}: ${project.id} adding missing users`);
								await processUsers({
									new_project: project,
									new_pid: project.id,
									users: users_to_update
								}).catch(errorHandle);
							}

							resolve();
						} catch (e) {
							log.info(`FAILED: ${project.client.name}: ${project.id}: ${e}`);
							resolve(e);
						}
					} else {
						if (
							project.name ==
								config.harvestv2.service_project +
									moment()
										.subtract(1, 'months')
										.format('YYYY-MM') &&
							project.is_active
						) {
							await toggleProject({ old_project: project, new_project: project });
						}
						resolve();
					}
				}).catch(function(reason) {
					log.error(`failed - ${reason}`);
					return resolve();
				});
			});

			Promise.all(promises)
				.then(function() {
					return resolve();
				})
				.catch(function(reason) {
					log.error(`failed - ${reason}`);
					return resolve();
				});
		}

		log.info('Get Projects');
		getPages('projects')
			.then(callback)
			.catch(function(reason) {
				log.info(`Failed: ${reason}`);
			});
	}).catch(function(reason) {
		log.error(`failed - ${reason}`);
	});
};
