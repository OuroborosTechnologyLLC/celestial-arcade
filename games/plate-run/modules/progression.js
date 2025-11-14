export default class ProgressionManager {
	constructor() {
		this.progression = { coins: 0, xp: 0, achievements: [], unlockedItems: [] };
		this.setupMessageListener();
		this.requestProgression();
	}

	setupMessageListener() {
		window.addEventListener('message', (event) => {
			if (event.origin !== window.location.origin) return;
			if (event.data.type === 'progression.response') {
				this.progression = event.data.data;
				console.log('Progression loaded:', this.progression);
			}
		});
	}

	requestProgression() {
		window.parent.postMessage({ type: 'progression.request' }, window.location.origin);
	}

	updateProgression(data) {
		const updateData = { coinsEarned: data.coinsEarned || 0, xpEarned: data.xpEarned || 0, newAchievements: data.newAchievements || [], newUnlockedItems: data.newUnlockedItems || [] };
		const update = { type: 'progression.update', data: updateData };
		window.parent.postMessage(update, window.location.origin);
		if (data.coinsEarned) this.progression.coins += data.coinsEarned;
		if (data.xpEarned) this.progression.xp += data.xpEarned;
		if (data.newAchievements) {
			data.newAchievements.forEach(ach => {
				if (!this.progression.achievements.includes(ach)) this.progression.achievements.push(ach);
			});
		}
		if (data.newUnlockedItems) {
			data.newUnlockedItems.forEach(item => {
				if (!this.progression.unlockedItems.includes(item)) this.progression.unlockedItems.push(item);
			});
		}
	}

	getProgression() {
		return this.progression;
	}
}
