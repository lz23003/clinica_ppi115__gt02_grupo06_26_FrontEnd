export const connectivity = {
  isOnline() {
    return globalThis.navigator?.onLine ?? true;
  },

  subscribe(callback) {
    const target = globalThis.window;
    if (!target?.addEventListener || !target?.removeEventListener) {
      return () => {};
    }

    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);
    target.addEventListener('online', handleOnline);
    target.addEventListener('offline', handleOffline);

    return () => {
      target.removeEventListener('online', handleOnline);
      target.removeEventListener('offline', handleOffline);
    };
  }
};
