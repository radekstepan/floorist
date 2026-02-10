# Agent Instructions - Floorist

This document provides context and instructions for AI agents working on the Floorist project.

## Project Architecture

Floorist is a client-side React application built with Vite and Tailwind CSS.

- **`src/App.tsx`**: Contains the main application logic, state management, and UI.
- **`src/types.ts`**: Defines the core data structures for furniture items and floorplans.
- **`src/data/furniture.ts`**: Contains the predefined palette of furniture items.
- **`src/utils/`**: Utility functions for styling and other helpers.

## Contribution Guidelines for Agents

- **Component Creation**: When adding new UI elements, use Tailwind CSS for styling and follow the existing design pattern (indigo/blue color scheme).
- **State Management**: The application currently uses React `useState` and `useEffect` for state management. Keep state updates efficient.
- **Furniture Items**: New furniture items should be added to `src/data/furniture.ts` with appropriate dimensions and icons.
- **Testing**: Ensure that drag-and-drop functionality and local storage persistence are maintained after any changes.

## Development Commands

- `yarn dev`: Start the development server.
- `yarn build`: Create a production build.
- `yarn lint`: Run ESLint to check for code quality issues.
