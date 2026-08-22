# GeoERP Mobile

React Native / Expo mobile app for GeoERP field operations.

## Stack

- **Runtime**: Expo SDK 57, React Native 0.86, TypeScript
- **Styling**: NativeWind 4 (Tailwind CSS for React Native)
- **Navigation**: Expo Router (file-based routing)
- **State**: Zustand (auth store) + TanStack Query (server state)
- **Backend**: Supabase (shared with GeoERP web admin at Techingenius/geoerp)
- **Maps**: react-native-maps
- **Location**: expo-location
- **Forms**: React Hook Form + Zod

## Project Structure

```
app/              # Expo Router screens (file-based routing)
├── (auth)/       # Auth flow (login) — unauthenticated users
├── (tabs)/       # Main tab navigator — authenticated users
│   ├── index     # Projects list
│   ├── map       # General map view
│   └── profile   # User profile + logout
└── project/[id]  # Project detail with map, segments, services

lib/
├── api/          # TanStack Query hooks (projects, services)
├── hooks/        # Custom hooks (useLocation)
├── stores/       # Zustand stores (auth)
├── supabase/     # Supabase client config
└── utils/        # Helpers

components/
├── ui/           # Reusable primitives (Button, Input, Card)
├── map/          # Map-specific components
├── forms/        # Form components
└── features/     # Feature-specific components

types/            # TypeScript types (database models)
```

## Environment Setup

Copy `.env.example` to `.env` and set:
- `EXPO_PUBLIC_SUPABASE_URL` — same Supabase project as the web admin
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — anon key from same project

## Dev Commands

```bash
npm start          # Start Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
```

## Conventions

- Use NativeWind `className` for all styling — no `StyleSheet.create`
- Use `Pressable` over `TouchableOpacity`
- Always wrap screens in `SafeAreaView`
- All API calls go through TanStack Query hooks in `lib/api/`
- Auth state lives in Zustand store, not React context
- Database types in `types/database.ts` — keep in sync with web admin schema
- Spanish UI labels for field operators
