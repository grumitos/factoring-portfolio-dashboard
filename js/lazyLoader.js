const LazyLoader = {
  _loadedLibraries: {},

  _loadScript: function(url, globalVar) {
    if (this._loadedLibraries[url]) {
      return this._loadedLibraries[url];
    }

    if (window[globalVar]) {
      this._loadedLibraries[url] = Promise.resolve(window[globalVar]);
      return this._loadedLibraries[url];
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      
      script.onerror = (e) => {
        const error = new Error(`Error al cargar ${url}: ${e.type}`);
        console.error(error);
        
        delete this._loadedLibraries[url];
        reject(error);
      };
      
      const timeout = setTimeout(() => {
        const error = new Error(`Timeout al cargar ${url}`);
        console.error(error);
        delete this._loadedLibraries[url];
        reject(error);
      }, 10000); 
      
      script.onload = () => {
        clearTimeout(timeout);
        if (window[globalVar]) {
          resolve(window[globalVar]);
        } else {
          const error = new Error(`La biblioteca ${globalVar} no se expuso globalmente después de cargar ${url}`);
          console.error(error);
          delete this._loadedLibraries[url];
          reject(error);
        }
      };
      
      document.body.appendChild(script);
    });

    this._loadedLibraries[url] = promise;
    return promise;
  },

  loadChartJS: function(chartTypes = []) {
    if (chartTypes.length === 0 || chartTypes.length > 3) {
      return this._loadScript('https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js', 'Chart')
        .catch(error => {
          delete this._loadedLibraries['https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js'];
          return this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js', 'Chart');
        });
    }
    
    const baseUrl = 'https://cdn.jsdelivr.net/combine/';
    const essentials = 'npm/chart.js@3.9.1/dist/chunks/helpers.segment.min.js,npm/chart.js@3.9.1/dist/chunks/index.min.js';
    
    const typeModules = chartTypes.map(type => `npm/chart.js@3.9.1/dist/chunks/controllers.${type}.min.js`).join(',');
    
    const customUrl = `${baseUrl}${essentials},${typeModules}`;
    
    return this._loadScript(customUrl, 'Chart');
  },

  preload: function(libraries = []) {
    if (!navigator.connection || 
        (navigator.connection.saveData !== true && 
         navigator.connection.effectiveType !== 'slow-2g' && 
         navigator.connection.effectiveType !== '2g')) {
      
      libraries.forEach(lib => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        
        if (lib === 'chart') {
          link.href = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
        }
        
        if (link.href) {
          document.head.appendChild(link);
        }
      });
    }
  },
  
  clearCache: function(library = null) {
    if (library) {
      const keys = Object.keys(this._loadedLibraries).filter(
        key => key.includes(library.toLowerCase())
      );
      
      keys.forEach(key => {
        delete this._loadedLibraries[key];
      });
      
    } else {
      this._loadedLibraries = {};
    }
  }
};

window.LazyLoader = LazyLoader;