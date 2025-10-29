export default class DifficultyController {
	constructor(scene) {
		this.scene = scene;
		this.distance = 0;
		this.currentSpeed = settings.MIN_SPEED;
	}
	
	update(delta, isRunning) {
		this.distance += this.currentSpeed * delta;
		this.adjustDifficulty();
	}
	
	adjustDifficulty() {
		// Gradually increase speed based on distance
	}
	
	getSpawnInterval() {
		// Returns ms between spawns based on difficulty
	}
	
	getCurrentSpeed() {
		return this.currentSpeed;
	}
}
