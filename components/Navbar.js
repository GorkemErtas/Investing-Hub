import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useColorScheme } from "react-native";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const navigation = useNavigation();
  const colorScheme = useColorScheme();

  useEffect(() => {
    const fetchUser = async () => {
      const storedUser = await AsyncStorage.getItem("user");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem("token");
    await AsyncStorage.removeItem("user");
    setUser(null);
    navigation.navigate("AuthScreen");
  };

  const toggleTheme = (theme) => {
    if (theme !== "light" && theme !== "dark") return;
    AsyncStorage.setItem("theme", theme);
    setModalVisible(false);
  };

  return (
    <View style={styles.navbar}>
      <View style={styles.logoContainer}>
        <Image
          source={{ uri: "https://i.hizliresim.com/bmkwbe4.png" }}
          style={styles.logo}
        />
        <Text style={styles.title}>INVESTING HUB v2</Text>
      </View>

      <View style={styles.menu}>
        <TouchableOpacity onPress={() => navigation.navigate("HomeScreen")}>
          <Text style={styles.link}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("PortfolioScreen")}>
          <Text style={styles.link}>Portfolio</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("LearningHubScreen")}>
          <Text style={styles.link}>Learning Hub</Text>
        </TouchableOpacity>

        {user ? (
          <View style={styles.userContainer}>
            <Text style={styles.userText}>{user.firstName} {user.lastName}</Text>
            <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logout}>Logout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => navigation.navigate("AuthScreen")}>
            <Text style={styles.link}>Login/Register</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalBox}>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => toggleTheme("light")}
            >
              <Text style={styles.modalText}>☀️ Light Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => toggleTheme("dark")}
            >
              <Text style={styles.modalText}>🌙 Dark Mode</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#222",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 40,
    height: 40,
    marginRight: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
  },
  menu: {
    flexDirection: "row",
    alignItems: "center",
  },
  link: {
    color: "white",
    fontSize: 16,
    marginHorizontal: 8,
  },
  userContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
  userText: {
    color: "#ddd",
    marginRight: 10,
  },
  logout: {
    color: "red",
    fontSize: 16,
  },
  settingsIcon: {
    fontSize: 20,
    marginLeft: 12,
    color: "white",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 8,
    width: 200,
    elevation: 5,
  },
  modalButton: {
    paddingVertical: 10,
  },
  modalText: {
    fontSize: 16,
    textAlign: "center",
  },
});
