/**
 * @fileoverview Custom hooks for performance optimization.
 */
import { useRef, useMemo, useCallback, useEffect, DependencyList } from "react";

/**
 * Returns a stable reference to a value that only changes when the value
 * actually changes (using deep comparison).
 * Useful for preventing unnecessary re-renders with object/array dependencies.
 */
export function useStableValue<T>(value: T): T {
    const ref = useRef<T>(value);
    const stableValue = useMemo(() => {
        if (JSON.stringify(ref.current) !== JSON.stringify(value)) {
            ref.current = value;
        }
        return ref.current;
    }, [value]);
    return stableValue;
}

/**
 * Returns a memoized callback that has a stable reference.
 * Useful when you need to pass callbacks to optimized child components.
 */
export function useStableCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
    callback: T
): T {
    const ref = useRef<T>(callback);

    useEffect(() => {
        ref.current = callback;
    }, [callback]);

    return useCallback((...args: Parameters<T>) => {
        return ref.current(...args);
    }, []) as T;
}

/**
 * Debounces a value, only updating after the specified delay.
 * Useful for search inputs where you don't want to trigger on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

// Need to import useState for useDebouncedValue
import { useState } from "react";

/**
 * Returns a function that is throttled - it will only execute once per delay period.
 */
export function useThrottledCallback<T extends (...args: Parameters<T>) => void>(
    callback: T,
    delay: number
): T {
    const lastRan = useRef(0);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const throttledCallback = useCallback((...args: Parameters<T>) => {
        const now = Date.now();
        const remaining = delay - (now - lastRan.current);

        if (remaining <= 0) {
            lastRan.current = now;
            callback(...args);
        } else if (!timeoutRef.current) {
            timeoutRef.current = setTimeout(() => {
                lastRan.current = Date.now();
                timeoutRef.current = null;
                callback(...args);
            }, remaining);
        }
    }, [callback, delay]) as T;

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return throttledCallback;
}

/**
 * Memoizes an expensive computation, with an optional equality function.
 */
export function useMemoWithCompare<T>(
    factory: () => T,
    deps: DependencyList,
    isEqual: (prev: DependencyList, next: DependencyList) => boolean
): T {
    const prevDepsRef = useRef<DependencyList>(deps);
    const valueRef = useRef<T | undefined>(undefined);

    if (valueRef.current === undefined || !isEqual(prevDepsRef.current, deps)) {
        valueRef.current = factory();
        prevDepsRef.current = deps;
    }

    return valueRef.current;
}

/**
 * Deep comparison function for use with useMemoWithCompare.
 */
export function deepEqual(prev: DependencyList, next: DependencyList): boolean {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
        if (JSON.stringify(prev[i]) !== JSON.stringify(next[i])) {
            return false;
        }
    }
    return true;
}
