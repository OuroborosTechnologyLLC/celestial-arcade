import * as Phaser from './libs/phaser.esm.js';

let mainPath = './scenes/mainScene.js';
const { default: MainScene } = await import(`${mainPath}?t=${Date.now()}`);
let runPath = './scenes/runScene.js';
const { default: RunScene } = await import(`${runPath}?t=${Date.now()}`);

const config = {
	type: Phaser.AUTO,
	scale: {
		mode: Phaser.Scale.RESIZE, // auto-resize with window
		autoCenter: Phaser.Scale.CENTER_BOTH,
		width: '100%',
		height: '100%',
	},
	// physics: {
	// 	default: 'arcade',
	// 	arcade: {
	// 		debug: true,
	// 		gravity: {
	// 			x: 0,
	// 			y: 0
	// 		}
	// 	}
	// },
	// scene: [ MainScene ],
	scene: [ RunScene ],
};
const game = new Phaser.Game(config);
window.game = game;

// Optional: auto-reload every few seconds for dev (polling method)
// setInterval(async () => {
// 	const newModule = await import(`${modulePath}?t=${Date.now()}`);
// 	if (sceneModule.dispose) sceneModule.dispose(); // clean up
// 	sceneModule = newModule;
// 	newModule.init();
// }, 3000);

