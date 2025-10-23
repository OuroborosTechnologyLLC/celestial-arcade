let modulePath = './scene.js';
let sceneModule = await import(`${modulePath}?t=${Date.now()}`);

sceneModule.init(); // your scene setup + start loop

// Optional: auto-reload every few seconds for dev (polling method)
// setInterval(async () => {
// 	const newModule = await import(`${modulePath}?t=${Date.now()}`);
// 	if (sceneModule.dispose) sceneModule.dispose(); // clean up
// 	sceneModule = newModule;
// 	newModule.init();
// }, 3000);

