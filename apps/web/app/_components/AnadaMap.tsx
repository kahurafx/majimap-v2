'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    ArrowLeft, Info, SlidersHorizontal,
    Droplet, Activity, ShieldAlert, Settings, MapPin,
    ChevronDown, Sun, Moon, Database
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

// We use coordinates near a generic city center to simulate a localized network
// Longitude, Latitude (Nairobi as base)
const CENTER_COORDS = [36.8219, -1.2921];

const MOCK_ASSETS = [
    {
        id: 'a1',
        name: 'Central Reservoir',
        type: 'Reservoir',
        distance: '0.2 mi',
        status: 'Optimal',
        metric: '92% Cap',
        coords: [36.8250, -1.2880],
        icon: Database,
        color: 'bg-blue-100 text-blue-600',
        markerColor: '#3b82f6',
    },
    {
        id: 'a2',
        name: 'Main Pump Station',
        type: 'Pump',
        distance: '0.5 mi',
        status: 'Warning',
        metric: '85 PSI',
        coords: [36.8180, -1.2950],
        icon: Activity,
        color: 'bg-yellow-100 text-yellow-600',
        markerColor: '#eab308',
    },
    {
        id: 'a3',
        name: 'Pressure Valve 04',
        type: 'Valve',
        distance: '0.8 mi',
        status: 'Optimal',
        metric: 'Normal',
        coords: [36.8300, -1.2900],
        icon: Settings,
        color: 'bg-green-100 text-green-600',
        markerColor: '#22c55e',
    },
    {
        id: 'a4',
        name: 'Westside Main Pipe',
        type: 'Pipe',
        distance: '1.2 mi',
        status: 'Critical',
        metric: 'Leak Det.',
        coords: [36.8120, -1.2850],
        icon: Droplet,
        color: 'bg-red-100 text-red-600',
        markerColor: '#ef4444',
    },
    {
        id: 'a5',
        name: 'East District Tower',
        type: 'Reservoir',
        distance: '1.5 mi',
        status: 'Optimal',
        metric: '78% Cap',
        coords: [36.8350, -1.2980],
        icon: Database,
        color: 'bg-blue-100 text-blue-600',
        markerColor: '#3b82f6',
    },
    {
        id: 'a6',
        name: 'Substation Pump 3',
        type: 'Pump',
        distance: '2.1 mi',
        status: 'Optimal',
        metric: '60 PSI',
        coords: [36.8100, -1.3000],
        icon: Activity,
        color: 'bg-green-100 text-green-600',
        markerColor: '#22c55e',
    }
];

const ThemeStyles = () => (
    <style dangerouslySetInnerHTML={{__html: `
    :root {
      --background: 0 0% 100%;
      --foreground: 240 10% 3.9%;
      --card: 0 0% 100%;
      --card-foreground: 240 10% 3.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 240 10% 3.9%;
      --primary: 240 5.9% 10%;
      --primary-foreground: 0 0% 98%;
      --secondary: 240 4.8% 95.9%;
      --secondary-foreground: 240 5.9% 10%;
      --muted: 240 4.8% 95.9%;
      --muted-foreground: 240 3.8% 46.1%;
      --accent: 240 4.8% 95.9%;
      --accent-foreground: 240 5.9% 10%;
      --border: 240 5.9% 90%;
      --input: 240 5.9% 90%;
      --ring: 240 5.9% 10%;
      --radius: 0.75rem;
    }
    
    .dark {
      --background: 240 10% 3.9%;
      --foreground: 0 0% 98%;
      --card: 240 10% 3.9%;
      --card-foreground: 0 0% 98%;
      --popover: 240 10% 3.9%;
      --popover-foreground: 0 0% 98%;
      --primary: 0 0% 98%;
      --primary-foreground: 240 5.9% 10%;
      --secondary: 240 3.7% 15.9%;
      --secondary-foreground: 0 0% 98%;
      --muted: 240 3.7% 15.9%;
      --muted-foreground: 240 5% 64.9%;
      --accent: 240 3.7% 15.9%;
      --accent-foreground: 0 0% 98%;
      --border: 240 3.7% 15.9%;
      --input: 240 3.7% 15.9%;
      --ring: 240 4.9% 83.9%;
    }

    body {
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    .maplibregl-popup-content {
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius);
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    
    .maplibregl-popup-tip {
      border-top-color: hsl(var(--background)) !important;
      border-bottom-color: hsl(var(--background)) !important;
    }

    /* Custom marker animations */
    @keyframes pulse-ring {
      0% { transform: scale(0.8); opacity: 0.5; }
      100% { transform: scale(1.5); opacity: 0; }
    }
    .marker-pulse::after {
      content: '';
      position: absolute;
      top: -4px; left: -4px; right: -4px; bottom: -4px;
      border-radius: 50%;
      border: 2px solid;
      border-color: inherit;
      animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    }
  `}} />
);

export default function AnadaMap() {

    const [isDark, setIsDark] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAssetId, setSelectedAssetId] = useState(null);

    const mapContainer = useRef(null);
    const map = useRef(null);
    const markers = useRef({});

    // Toggle Theme
    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    useEffect(() => {
        if (map.current) return; // initialize map only once

        // Using standard free vector tiles that look good in dark/light mode
        const mapStyle = isDark
            ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
            : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: mapStyle,
            center: CENTER_COORDS,
            zoom: 13,
            pitch: 45,
            attributionControl: false
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

        // Add markers once map loads
        map.current.on('load', () => {
            MOCK_ASSETS.forEach(asset => {
                // Create custom DOM element for marker
                const el = document.createElement('div');
                el.className = 'relative flex flex-col items-center cursor-pointer group transition-transform hover:scale-110 z-10';
                el.style.borderColor = asset.markerColor;

                // Marker styling to match the reference image
                const isCritical = asset.status === 'Critical';

                el.innerHTML = `
          <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg border-2" style="border-color: ${asset.markerColor}; color: ${asset.markerColor}">
            <!-- We inject a simple SVG representing the icon since we can't easily pass Lucide components directly as HTML strings -->
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${asset.type === 'Reservoir' ? '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>' : ''}
              ${asset.type === 'Pump' ? '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' : ''}
              ${asset.type === 'Valve' ? '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' : ''}
              ${asset.type === 'Pipe' ? '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>' : ''}
            </svg>
          </div>
          <div class="mt-1 px-2 py-1 bg-secondary text-secondary-foreground text-xs font-bold rounded-md shadow flex items-center gap-1 border border-border">
            <span class="w-2 h-2 rounded-full" style="background-color: ${asset.markerColor}"></span>
            ${asset.metric}
          </div>
          ${isCritical ? `<div class="absolute inset-0 marker-pulse rounded-full pointer-events-none" style="border-color: ${asset.markerColor}"></div>` : ''}
        `;

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setSelectedAssetId(asset.id);
                    map.current.flyTo({ center: asset.coords, zoom: 15, pitch: 60 });
                });

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat(asset.coords)
                    .addTo(map.current);

                markers.current[asset.id] = { marker, el };
            });
        });
    }, []);

    // Update map style when theme changes
    useEffect(() => {
        if (map.current && map.current.isStyleLoaded()) {
            const mapStyle = isDark
                ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
                : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
            map.current.setStyle(mapStyle);
        }
    }, [isDark]);

    // Sync selected marker styling
    useEffect(() => {
        Object.entries(markers.current).forEach(([id, { el }]) => {
            if (id === selectedAssetId) {
                el.style.zIndex = '50';
                el.classList.add('scale-125');
            } else {
                el.style.zIndex = '10';
                el.classList.remove('scale-125');
            }
        });
    }, [selectedAssetId]);

    const filteredAssets = useMemo(() => {
        return MOCK_ASSETS.filter(asset =>
            asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            asset.type.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
            <ThemeStyles />

            {/* Sidebar Panel */}
            <aside className="w-full md:w-[420px] h-full flex flex-col border-r border-border bg-background z-20 shadow-xl flex-shrink-0">

                {/* Header */}
                <header className="px-6 py-5 flex items-center justify-between border-b border-border/40">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full bg-secondary/50">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold shadow-md">
                                <Droplet className="h-5 w-5" />
                            </div>
                            <h1 className="text-lg font-semibold tracking-tight">AquaFlow Assets</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setIsDark(!isDark)}>
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="w-8 h-8">
                            <Info className="h-4 w-4" />
                        </Button>
                    </div>
                </header>

                {/* Search & Filters */}
                <div className="p-6 pb-2 space-y-4">
                    <Input
                        placeholder="Search assets, locations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />

                    <div className="flex items-center justify-between text-sm">
                        <div className="flex space-x-2 w-full">
                            <Button variant="outline" size="sm" className="flex-1 rounded-full text-xs h-8">
                                Type <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 rounded-full text-xs h-8">
                                Nearest <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                            </Button>
                            <Button variant="outline" size="sm" className="w-9 h-8 px-0 rounded-full flex-shrink-0 bg-secondary/50">
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Asset List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredAssets.map(asset => {
                        const Icon = asset.icon;
                        const isSelected = selectedAssetId === asset.id;

                        return (
                            <div
                                key={asset.id}
                                onClick={() => {
                                    setSelectedAssetId(asset.id);
                                    if (map.current) {
                                        map.current.flyTo({ center: asset.coords, zoom: 15 });
                                    }
                                }}
                                className={`flex items-center p-3 rounded-2xl cursor-pointer transition-all duration-200 border ${
                                    isSelected
                                        ? 'bg-accent border-border shadow-sm'
                                        : 'border-transparent hover:bg-secondary/50'
                                }`}
                            >
                                {/* Left Icon Area */}
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm border border-black/5 dark:border-white/5 ${asset.color}`}>
                                    <Icon className="h-5 w-5" />
                                </div>

                                {/* Main Content Info */}
                                <div className="ml-4 flex-1 min-w-0">
                                    <h3 className="text-sm font-semibold text-foreground truncate">
                                        {asset.name}
                                    </h3>
                                    <div className="flex items-center text-xs text-muted-foreground mt-0.5 space-x-1">
                                        <span>{asset.distance}</span>
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40"></span>
                                        <span className="flex items-center">
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                          asset.status === 'Optimal' ? 'bg-green-500' :
                              asset.status === 'Warning' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></span>
                                            {asset.status}
                    </span>
                                    </div>
                                </div>

                                {/* Right Action/Metric Icons */}
                                <div className="flex flex-col items-end justify-center space-y-2 pl-2">
                                    <div className="flex space-x-2 text-muted-foreground">
                                        <ShieldAlert className="h-4 w-4 opacity-70 hover:opacity-100 transition-opacity" />
                                        <MapPin className="h-4 w-4 opacity-70 hover:opacity-100 transition-opacity" />
                                    </div>
                                    {asset.status !== 'Optimal' && (
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                      {asset.status === 'Critical' ? 'Attention' : 'Review'}
                    </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {filteredAssets.length === 0 && (
                        <div className="text-center p-8 text-muted-foreground text-sm">
                            No assets found matching "{searchQuery}"
                        </div>
                    )}
                </div>
            </aside>

            {/* Map Area */}
            <main className="flex-1 relative h-full bg-muted">
                <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

                {/* Mobile Gradient Overlay (optional, for aesthetics) */}
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.1)] z-0" />
            </main>

        </div>
    );
}