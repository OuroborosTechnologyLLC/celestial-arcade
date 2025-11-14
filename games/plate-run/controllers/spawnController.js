import { settings } from '../settings.js';

export default class SpawnController {
	constructor(scene, worldController, difficultyController) {
		this.scene = scene;
		this.world = worldController;
		this.difficulty = difficultyController;
		this.obstacles = scene.add.group();
	}
	
	update(delta) {
		this.spawnTimer += delta;
		if (this.shouldSpawn()) {
			this.spawnObstacle();
		}
	}
	
	spawnObstacle() {
		const lane = this.selectRandomLane();
		const y = this.world.getLaneY(lane);
		// Spawn tree/obstacle
	}
	
	shouldSpawn() {
		return this.spawnTimer > this.difficulty.getSpawnInterval();
	}
}
