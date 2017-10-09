const sendRequest = require('../actions/sendRequest.js'),
	log = require('../actions/logging.js');

module.exports = function(pid, user) {
	return new Promise(async function(resolve, reject) {
		let new_user;
		log.info(`${pid} user to add ${user}`);

		try {
			new_user = await sendRequest('POST', {
				path: '/projects/' + pid + '/user_assignments',
				body: {
					user: {
						id: user
					}
				}
			});
		} catch (e) {
			reject('failed to add user');
		}
		resolve(new_user);
	});
};
