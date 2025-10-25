import * as Phaser from '../libs/phaser.esm.js';

export default class MainScene extends Phaser.Scene {
	constructor() {
		super('MainScene');
		this.camera = null;
		this.horizonY = 0;
		this.margin = 24;
		this.maxSpeed = 0.07;
		this.minSpeed = 0.02;
		this.numStrips = 100;
		this.roadHeight = 10;
		this.roadOffset = 0;
		this.roadSectionSize = 10;
		this.roadStrips = [];
		this.roadWidth = 200;
		this.speed = this.minSpeed;
		this.speedChange = 0.01;
		this.fogOverlay = null;
		this.fogDensity = 0; // changes dynamically
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

		const g = add.graphics();
		g.fillStyle(0x050e39, 1);
		g.fillRect(0, 0, scale.width, this.horizonY);
		g.generateTexture('sky', scale.width, this.horizonY);
		this.sky = add.image(0, 0, 'sky').setOrigin(0).setDepth(1);
		g.fillStyle(0x0a2f0a, 1);
		g.fillRect(0, this.horizonY, scale.width, this.horizonY);
		g.generateTexture('ground', scale.width, this.horizonY);
		this.ground = add.image(0, 2, 'ground').setOrigin(0).setDepth(1);
		g.destroy();

		this.fogOverlay = add.graphics({ x: 0, y: 0 }).setDepth(100);
		const camera = this.cameras.main;
		camera.postFX.addVignette(0.5, 0.5, 0.7);

		this.title = add.text(scale.width/2, margin, 'Plate Run', {
			font: '32px Arial',
			fill: '#ffffff',
			align: 'center',
			stroke: '#000000',
			strokeThickness: 2,
		}).setOrigin(0.5).setShadow(1, 1, 'rgba(0, 0, 0, 0.5)', 5).setDepth(999);

		this.speedText = this.add.text(16, 16, 'Speed: 0\nUse Arrow Keys', {
			font: '14px Monospace',
			fill: '#ffffff',
			stroke: '#000000',
			strokeThickness: 2,
		}).setShadow(1, 1, 'rgba(0, 0, 0, 0.5)', 5).setDepth(999);

		this.cursors = this.input.keyboard.createCursorKeys();

		scale.on('resize', this.resize, this);
		this.resize({ width: scale.width, height: scale.height });
	}

	resize({ width, height }) {
		this.horizonY = height / 2;
		this.title.x = width / 2;
	}

	update(time, delta) {
		const { horizonY, numStrips, roadStrips, roadWidth, scale } = this;

		if (this.cursors.up.isDown) this.speed = Phaser.Math.Linear(this.speed, this.maxSpeed, 0.1);
		else if (this.cursors.down.isDown) this.speed = Phaser.Math.Linear(this.speed, this.minSpeed, 0.1);

		this.roadOffset += this.speed * delta;

		roadStrips.forEach((strip, i) => {
			const depth = (i + this.roadOffset) % numStrips / numStrips;
			const eased = depth;
			const perspective = 1 + eased * 6;
			const width = roadWidth * perspective;

			strip.setPosition(scale.width / 2 - width / 2, horizonY + depth * horizonY);
			strip.setScale(perspective);
			strip.setDepth(depth * 10);
		});

		this.fogDensity = Phaser.Math.Clamp((this.speed - this.minSpeed) / (this.maxSpeed - this.minSpeed), 0, 1);
		this.drawFog(scale.width, scale.height);
		this.speedText.setText(`Speed: ${this.speed.toFixed(3)}`);
	}

	drawFog(width, height) {
		const g = this.fogOverlay;
		g.clear();

		// Fog color & gradient alpha
		const fogColor = 0x222222; // light gray fog
		const fogAlphaNear = 0.0;  // no fog at player
		const fogAlphaFar = 0.6 * this.fogDensity + 0.2; // stronger fog at horizon when faster

		// Draw a vertical gradient (top -> bottom)
		const steps = 50;
		for (let i = 0; i < steps; i++) {
			const t = i / steps;
			const alpha = Phaser.Math.Interpolation.Linear([fogAlphaNear, fogAlphaFar], t);
			const y = this.horizonY * t;
			g.fillStyle(fogColor, alpha);
			g.fillRect(0, y, width, 2);
		}
	}
}
