# Animation Components Guide

This guide explains the new animation components and where to use them in the shopping app.

---

## 📦 Components

### 1. AnimatedList

**Purpose:** Staggered fade-in and slide-up animations for list items.

**Features:**
- Sequential entrance animations
- Customizable stagger delay
- Configurable duration
- Initial delay support
- Native driver optimization

**Props:**
```typescript
interface AnimatedListProps {
  children: React.ReactNode[];
  staggerDelay?: number;    // Default: 100ms
  duration?: number;         // Default: 400ms
  initialDelay?: number;     // Default: 0ms
  style?: ViewStyle;
}
```

**Basic Usage:**
```tsx
import AnimatedList from './components/AnimatedList';

<AnimatedList staggerDelay={100} duration={400}>
  {items.map(item => (
    <View key={item.id}>
      <Text>{item.name}</Text>
    </View>
  ))}
</AnimatedList>
```

---

### 2. StarBorder

**Purpose:** Animated rotating gradient border for premium/highlighted content.

**Features:**
- Infinite rotating gradient animation
- Customizable colors and speed
- Configurable border width and radius
- Perfect for premium features

**Props:**
```typescript
interface StarBorderProps {
  children: React.ReactNode;
  borderWidth?: number;      // Default: 2
  borderRadius?: number;     // Default: RADIUS.large (16)
  speed?: number;            // Default: 3000ms
  colors?: string[];         // Default: blue/purple gradient
  style?: ViewStyle;
}
```

**Basic Usage:**
```tsx
import StarBorder from './components/StarBorder';

<StarBorder
  colors={['#FFD700', '#FFA500', '#FF4500']}
  speed={3000}
>
  <View style={styles.premiumCard}>
    <Text>⭐ Premium Feature</Text>
  </View>
</StarBorder>
```

---

## 🎯 Implementation Locations

### AnimatedList - Best Use Cases

#### 1. **FrequentlyBoughtModal** (High Priority ⭐⭐⭐)
- **File:** `src/components/FrequentlyBoughtModal.tsx`
- **Where:** Wrap the FlatList items
- **Why:** Makes the list of frequent items appear with a smooth staggered animation
- **Impact:** High visual appeal when modal opens

```tsx
// In renderItem function
renderItem={({ item, index }) => (
  <AnimatedList staggerDelay={50} initialDelay={index * 50}>
    <View style={styles.itemRow}>
      {/* existing item content */}
    </View>
  </AnimatedList>
)}
```

#### 2. **FilterModal Chips** (Medium Priority ⭐⭐)
- **File:** `src/components/FilterModal.tsx`
- **Where:** Store chips, Category chips
- **Why:** Smooth entrance animation when filter section expands
- **Impact:** Professional micro-interaction

#### 3. **PriceHistoryModal - Purchase History** (Medium Priority ⭐⭐)
- **File:** `src/components/PriceHistoryModal.tsx`
- **Where:** History timeline items
- **Why:** Sequential reveal of price history entries
- **Impact:** Guides user's eye through the timeline

#### 4. **HomeScreen - Shopping Lists** (Low Priority ⭐)
- **File:** `src/screens/HomeScreen.tsx`
- **Where:** Main shopping list cards
- **Why:** Entrance animation on app load
- **Impact:** Polished first impression

#### 5. **ListDetailScreen - Items** (Low Priority ⭐)
- **File:** `src/screens/ListDetailScreen.tsx`
- **Where:** Shopping list items
- **Why:** Smooth reveal of items when entering a list
- **Impact:** Better UX when navigating between lists

---

### StarBorder - Best Use Cases

#### 1. **UpgradePrompt - Premium Tier** (High Priority ⭐⭐⭐)
- **File:** `src/components/UpgradePrompt.tsx`
- **Where:** Wrap the Premium and Family tier cards
- **Why:** Draws attention to subscription options
- **Impact:** Increases conversion by highlighting premium features

```tsx
<StarBorder
  colors={[COLORS.accent.blue, COLORS.accent.purple, COLORS.accent.blue]}
  speed={4000}
>
  <TouchableOpacity style={styles.tierCard}>
    {/* existing tier content */}
  </TouchableOpacity>
</StarBorder>
```

#### 2. **SubscriptionScreen - Active Subscription** (Medium Priority ⭐⭐)
- **File:** `src/screens/SubscriptionScreen.tsx`
- **Where:** Current subscription tier display
- **Why:** Highlights user's active premium status
- **Impact:** Makes premium users feel special

```tsx
<StarBorder
  colors={[COLORS.accent.green, COLORS.accent.yellow, COLORS.accent.green]}
  speed={3000}
>
  <View style={styles.activeSubscription}>
    <Text>⭐ Premium Active</Text>
  </View>
</StarBorder>
```

#### 3. **FrequentlyBoughtModal - Top Item** (Low Priority ⭐)
- **File:** `src/components/FrequentlyBoughtModal.tsx`
- **Where:** First/most purchased item
- **Why:** Highlights the #1 most bought item
- **Impact:** Draws attention to popular items

#### 4. **AnalyticsScreen - Best Deal Store** (Low Priority ⭐)
- **File:** `src/screens/AnalyticsScreen.tsx`
- **Where:** Store with lowest average price
- **Why:** Highlights savings opportunity
- **Impact:** Visual indicator of best value

#### 5. **BudgetScreen - Budget Alert** (Low Priority ⭐)
- **File:** `src/screens/BudgetScreen.tsx`
- **Where:** Budget warning/danger state
- **Why:** Animated border when approaching budget limit
- **Impact:** Eye-catching alert for budget concerns

---

## 🎨 Recommended Color Schemes

### StarBorder Colors by Context

**Premium/Subscription:**
```tsx
colors={[COLORS.accent.blue, COLORS.accent.purple, COLORS.accent.blue]}
// or
colors={['#FFD700', '#FFA500', '#FF4500']} // Gold gradient
```

**Active/Success:**
```tsx
colors={[COLORS.accent.green, COLORS.accent.yellow, COLORS.accent.green]}
```

**Warning/Alert:**
```tsx
colors={[COLORS.accent.orange, COLORS.accent.red, COLORS.accent.orange]}
```

**Budget Danger:**
```tsx
colors={[COLORS.accent.red, COLORS.accent.orange, COLORS.accent.red]}
```

---

## 🚀 Performance Tips

1. **AnimatedList:**
   - Use `initialNumToRender` with FlatList to limit initial animations
   - Consider disabling animations for very long lists (>50 items)
   - Set `initialDelay={0}` for instant start

2. **StarBorder:**
   - Use sparingly (1-2 per screen max)
   - Slower speeds (4000-5000ms) are more subtle and performant
   - Consider disabling on low-end devices (optional future enhancement)

---

## 📊 Priority Implementation Order

1. ✅ **UpgradePrompt with StarBorder** - Highest ROI for conversions
2. ✅ **FrequentlyBoughtModal with AnimatedList** - High visual impact
3. **SubscriptionScreen with StarBorder** - Premium user experience
4. **FilterModal with AnimatedList** - Polish micro-interactions
5. **PriceHistoryModal with AnimatedList** - Enhance data visualization

---

## 🔧 Installation Notes

Both components are ready to use! No additional dependencies needed beyond what's already in your app:
- ✅ React Native Animated API (built-in)
- ✅ expo-linear-gradient (already installed)
- ✅ Theme system integration (COLORS, RADIUS)

---

## 📝 Example Implementation

See the example files in the next section for complete implementation examples in your existing modals.

---

## Sources
- [Framer Motion - Animation Guide](https://www.framer.com/motion/animation/)
- [Animating list items in React with Framer Motion](https://www.sabhya.dev/animating-a-list-in-react-with-framer-motion)
- [ReactBits - Animated List](https://reactbits.dev/components/animated-list)
- [ReactBits - Star Border](https://reactbits.dev/animations/star-border)
- [React Native Animated API](https://reactnative.dev/docs/animated)
