import * as Phaser from './libs/phaser.esm.js';

let modulePath = './scenes/mainScene.js';
const { default: MainScene } = await import(`${modulePath}?t=${Date.now()}`);

const config = {
	type: Phaser.AUTO,
	backgroundColor: 'rgb(100, 200, 50)',
	scale: {
		mode: Phaser.Scale.RESIZE, // auto-resize with window
		autoCenter: Phaser.Scale.CENTER_BOTH,
		width: '100%',
		height: '100%',
	},
	scene: [ MainScene ],
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

