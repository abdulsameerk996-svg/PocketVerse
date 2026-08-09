import { Stack } from 'expo-router';
export default function DevLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#08080F' } }} />;
}
