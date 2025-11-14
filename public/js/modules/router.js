const routes = {};
let currentRoute = null;

export function registerRoute(path, handler) {
    routes[path] = handler;
}

export function navigate(path) {
    window.location.hash = path;
}

async function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    let route = routes[hash];
    let params = {};

    if (!route) {
        for (const [path, handler] of Object.entries(routes)) {
            const pattern = path.replace(/:[^/]+/g, '([^/]+)');
            const regex = new RegExp(`^${pattern}$`);
            const match = hash.match(regex);

            if (match) {
                route = handler;
                const paramNames = (path.match(/:[^/]+/g) || []).map(p => p.slice(1));
                paramNames.forEach((name, i) => {
                    params[name] = match[i + 1];
                });
                break;
            }
        }
    }

    if (!route) {
        route = routes['/'];
    }

    if (route) {
        currentRoute = hash;
        await route(params);
    } else {
        console.error('Route not found:', hash);
        navigate('/');
    }
}

export function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

export function getCurrentRoute() {
    return currentRoute;
}
