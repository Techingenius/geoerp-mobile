# GeoERP Mobile

React Native / Expo mobile app for GeoERP field operations. Separate repo from the web admin (Techingenius/geoerp). Connects to the same Supabase backend.

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Expo SDK | 57 |
| Framework | React Native | 0.86 |
| Language | TypeScript | strict mode |
| Styling | NativeWind | 4.x (Tailwind CSS for RN) |
| UI Components | react-native-reusables | latest (shadcn/ui for RN) |
| Navigation | Expo Router | 4.x (file-based) |
| Server State | TanStack Query | 5.x |
| Client State | Zustand | 5.x |
| Forms | React Hook Form + Zod | latest |
| Backend | Supabase | shared with web admin |
| Maps | react-native-maps | latest |
| Location | expo-location | latest |
| Camera/Photos | expo-image-picker, expo-camera | latest |
| Animations | react-native-reanimated | 4.x |
| Icons | @expo/vector-icons (Ionicons) | latest |

## Project Structure

```
app/              # Expo Router screens (file-based routing)
├── (auth)/       # Auth flow (login) — unauthenticated users only
├── (tabs)/       # Main tab navigator — authenticated users
│   ├── index     # Projects list
│   ├── map       # General map view
│   └── profile   # User profile + logout
└── project/[id]  # Project detail with map, segments, services

lib/
├── api/          # TanStack Query hooks (projects, services, etc.)
├── hooks/        # Custom hooks (useLocation, usePermission)
├── stores/       # Zustand stores (auth only — server state in TanStack Query)
├── supabase/     # Supabase client config
└── utils/        # Pure helper functions

components/
├── ui/           # Reusable primitives from react-native-reusables (Button, Card, Input, Badge, Sheet)
├── map/          # Map-specific components (markers, polylines, legends)
├── forms/        # Form components (ServiceForm, DamageForm)
└── features/     # Feature-specific composed components

types/            # TypeScript types (database models, navigation)
```

## Environment Setup

```bash
# Install
npm install

# Configure — copy and fill with Supabase credentials (same as web admin)
cp .env.example .env

# Run
npx expo start --clear    # Always use --clear after config changes
```

Required env vars:
- `EXPO_PUBLIC_SUPABASE_URL` — same Supabase project as the web admin
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — anon key from same project

## Critical Configuration Files

These files are **required** for NativeWind to work. If any is missing or misconfigured, **all styling silently breaks** — the app renders as plain unstyled text with no errors in the console.

| File | Purpose | If missing |
|------|---------|------------|
| `babel.config.js` | Babel presets for NativeWind className transform | **All styles silently ignored** |
| `metro.config.js` | Metro bundler NativeWind plugin | Styles not compiled |
| `tailwind.config.js` | Tailwind class definitions + content paths | Classes not recognized |
| `global.css` | Tailwind directives (@tailwind base/components/utilities) | No base styles |
| `nativewind-env.d.ts` | TypeScript declarations for className + CSS imports | TS errors on className |

**After modifying any of these files**: stop the server and restart with `npx expo start --clear`.

### babel.config.js (required exact content)
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

## Development Rules

### Styling
- **Always use NativeWind `className`** — never `StyleSheet.create` or inline `style` objects
- Test every screen visually on a device/simulator before committing — NativeWind failures are silent
- Use `Pressable` over `TouchableOpacity` (modern API, more flexible)
- Always wrap screens in `SafeAreaView` for notch/island handling
- Use react-native-reusables components from `components/ui/` — don't reinvent buttons, cards, inputs
- Flex defaults to `column` in RN (unlike web) — remember this when laying out horizontally

### State Management
- **Server state**: TanStack Query hooks in `lib/api/` — never raw `fetch` or `useEffect` for API data
- **Client state**: Zustand stores in `lib/stores/` — only for truly client-side state (auth, UI preferences)
- **Form state**: React Hook Form + Zod schemas — never `useState` for form fields
- Auth state lives in Zustand, not React Context

### API & Data
- All Supabase queries go through TanStack Query hooks in `lib/api/`
- Database types in `types/database.ts` — keep in sync with web admin schema
- When adding queries for new tables, verify the table exists in production Supabase first
- Use `select()` with explicit columns — avoid `select('*')` for performance
- Handle loading, error, and empty states in every screen that fetches data

### Maps
- iOS simulator uses Apple Maps by default (no API key needed)
- Android requires Google Maps API key in `app.json` under `android.config.googleMaps.apiKey`
- Geographic coordinates: always `[longitude, latitude]` in GeoJSON, but `{ latitude, longitude }` in react-native-maps
- Test map rendering on both platforms — behavior differs between Apple Maps and Google Maps

### Navigation
- Expo Router file-based routing — `app/` directory structure IS the route structure
- Auth guards in layout files: `(auth)/_layout.tsx` redirects to tabs if logged in, `(tabs)/_layout.tsx` redirects to login if not
- Use `router.push()` for forward navigation, `router.back()` for back
- Dynamic routes: `app/project/[id].tsx` — access with `useLocalSearchParams<{ id: string }>()`

### Photos & Camera
- Use `expo-image-picker` with `launchCameraAsync()` for field photos — open camera directly, not gallery
- Always capture GPS coordinates alongside photos for geotagging
- Upload to Supabase Storage bucket (bucket must exist — verify before uploading)
- Compress images before upload: `quality: 0.7` in image picker options

### Performance
- Use `FlatList` for lists, never `ScrollView` with `.map()` for dynamic data
- Minimize re-renders: extract components, use `useCallback` for handlers passed as props
- Prefetch adjacent screens' data with TanStack Query `prefetchQuery`
- Images: use `expo-image` for cached network images (not `Image` from react-native)

### Offline Awareness
- Show clear messaging when device is offline — never silently fail
- For MVP: display "Sin conexión" banner, disable actions that require network
- Future: implement offline queue with AsyncStorage for field operations

## UI/UX Guidelines

### Target Users
Field operators and trincheros using the app in outdoor conditions:
- **One-handed operation** — thumb-reachable actions
- **Bright sunlight** — high contrast colors, no subtle grays for important info
- **Gloves possible** — large touch targets (minimum 48x48px)
- **Speed critical** — any field operation must complete in < 2 minutes

### Design Principles
1. **Mapa es el centro** — the map should dominate the screen, everything else is secondary
2. **Mínimos pasos** — reduce taps for common operations (create service, take photo, change status)
3. **Feedback inmediato** — every action shows instant visual feedback (toast, animation, color change)
4. **Error prevention** — disable actions that can't succeed (no GPS = can't create service, no photo = can't save)
5. **Spanish UI** — all user-facing labels in Spanish for field operators

### Color Palette (consistent with web admin)
- **Primary**: `#2563eb` (blue-600)
- **Service Pending**: `#6b7280` (gray-500)
- **Service Located**: `#f59e0b` (amber-500)
- **Service Approved**: `#22c55e` (green-500)
- **Service Completed**: `#3b82f6` (blue-500)
- **Service Not Found**: `#ef4444` (red-500)
- **Drill Ready (segment)**: `#22c55e` (green-500)
- **Not Ready (segment)**: `#ef4444` (red-500)

### Component Patterns
- **Bottom sheets** over full-screen modals for quick actions
- **Chips/pills** for single-select options (service type, status) — faster than dropdowns
- **FAB** (Floating Action Button) for primary create actions on map screens
- **Pull-to-refresh** on all list screens
- **Skeleton loaders** during data fetching — never blank screens

## Pre-Commit Checklist

Before pushing any code:

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] App runs on iOS simulator (`npx expo start --clear`, then press `i`)
- [ ] App runs on Android (Expo Go 57.0.9+ or emulator)
- [ ] All screens render with correct styling (NativeWind classes applied)
- [ ] New screens have loading, error, and empty states
- [ ] Map screens render and show data (if connected to Supabase)
- [ ] No `StyleSheet.create` introduced (use className only)
- [ ] No hardcoded Supabase URLs or keys (use env vars)

## Branch & PR Conventions

- **Never push directly to main** — always open a PR
- Branch naming: `GRA-<number>/<short-description>`
- PR title: include issue key — `feat: GRA-400 mobile UI overhaul`
- Request review from **Ross** before merge
- After merge: verify on device that the changes work as expected

## Common Gotchas

1. **NativeWind styles not applying**: Check that `babel.config.js` exists and has the correct content (see above). Restart with `--clear`.
2. **Expo Go version mismatch**: SDK 57 needs Expo Go 57.0.9+. Android: install APK from https://expo.dev/go. iOS simulator: accept the auto-update prompt.
3. **Map not rendering**: iOS simulator needs Apple Maps (default). Android needs Google Maps API key.
4. **GPS in simulator**: iOS simulator allows simulating location (Debug > Location). Android emulator has GPS simulation in extended controls.
5. **Supabase query fails silently**: TanStack Query catches errors — check the `error` property from `useQuery`, don't assume `data` is populated.
6. **react-native-maps coordinates**: GeoJSON uses `[lng, lat]`, but react-native-maps uses `{ latitude, longitude }` — mix-ups cause markers to appear in the ocean.
7. **Tailwind classes not found**: Ensure `tailwind.config.js` `content` array includes all directories with `.tsx` files.
8. **Hot reload breaks styles**: After modifying tailwind.config.js or babel.config.js, you MUST restart with `npx expo start --clear`.
