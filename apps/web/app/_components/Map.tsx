'use client';

import { useEffect, useRef } from 'react';
import { Map, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// 1. Apply the Turbopack worker fix from the previous step
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export default function WaterDistributionMap() {
    // 2. Refs for the DOM element and the MapLibre instance
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<Map | null>(null);

    useEffect(() => {
        // 3. Guard clause: Ensure DOM exists and map isn't already initialized
        if (map.current || !mapContainer.current) return;

        // 4. Initialize the map
        map.current = new Map({
            container: mapContainer.current,
            zoom: 9,
            center: [137.9150899566626, 36.25956997955441],
            style: `https://tiles.openfreemap.org/styles/positron`,
        });

        // Optional: Add map controls (zoom/rotation)
        // map.current.addControl(new NavigationControl(), 'top-right');

        // 5. Cleanup on unmount to prevent memory leaks
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    return (
        <div className="relative w-full h-screen">
            {/*
        The map container MUST have a defined height and width.
        Using Tailwind classes here for full screen viewport.
      */}
            <div
                ref={mapContainer}
                className="absolute inset-0 w-full h-full"
            />
        </div>
    );
}