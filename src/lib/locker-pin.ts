const STORAGE_KEY = "home-inventory:locker-pin";

export function getStoredLockerPin(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredLockerPin(pin: string) {
  try {
    localStorage.setItem(STORAGE_KEY, pin);
  } catch {
    // Private browsing / storage disabled — PIN just won't persist.
  }
}

export function clearStoredLockerPin() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing / storage disabled — nothing to clear.
  }
}
