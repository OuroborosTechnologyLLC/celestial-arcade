import * as Phaser from '../libs/phaser.esm.js';

export default class MainScene extends Phaser.Scene {
	constructor() {
		super('MainScene');
		this.horizonY = 0;
		this.margin = 24;
		this.numStrips = 100;
		this.roadHeight = 10;
		this.roadOffset = 0;
		this.roadSectionSize = 5;
		this.roadStrips = [];
		this.roadWidth = 200;
		this.speed = 0.0;
		this.speedChange = 0.001;
	}

	preload() {
		this.load.image('diamond', '../assets/diamonds.png');
	}

	create() {
		const { add, margin, numStrips, roadHeight, roadWidth, roadSectionSize, roadStrips, scale } = this;
		this.horizonY = scale.height / 2;

		for (let i = 0; i < numStrips; i++) {
			const g = add.graphics();
			g.fillStyle(Math.floor(i / roadSectionSize) % 2 ? 0x36261c : 0x3d2d22, 1);
			g.fillRect(-roadWidth, 0, roadWidth * 2, roadHeight);

			const textureKey = `roadstrip_${i}`;
			g.generateTexture(textureKey, roadWidth * 2, roadHeight);
			g.destroy();

			const strip = add.image(scale.width / 2, 0, textureKey);
			strip.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
			strip.setOrigin(0);
			roadStrips.push(strip);
		}

		scale.on('resize', this.resize, this);

		this.title = add.text(scale.width/2, margin, 'Plate Run', {
			font: "32px Arial",
			fill: "#ffffff",
			align: "center",
		}).setOrigin(0.5).setShadow(1, 1, 'rgba(0, 0, 0, 0.5)', 5);

		this.cursors = this.input.keyboard.createCursorKeys();

		this.resize({ width: scale.width, height: scale.height });
	}

	resize({ width, height }) {
		console.log('Resized to', width, height);
		this.title.x = width / 2;
	}

	update(time, delta) {
		const { horizonY, numStrips, roadStrips, roadWidth, scale } = this;

		if (this.cursors.up.isDown) {
			this.speed += this.speedChange;
		}
		if (this.cursors.down.isDown) {
			this.speed -= this.speedChange;
			this.speed = Math.max(0, this.speed);
		}

		this.roadOffset += this.speed * delta;

		roadStrips.forEach((strip, i) => {
			const depth = (i + this.roadOffset) % numStrips / numStrips;
			const eased = depth;
			const perspective = 1 + eased * 6;
			const width = roadWidth * perspective;
			strip.x = scale.width / 2 - width / 2;
			strip.scaleX = perspective;
			strip.y = horizonY + depth * horizonY;
		});
	}
}
