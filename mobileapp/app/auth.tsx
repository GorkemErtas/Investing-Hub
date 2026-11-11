import { i18n, userError } from "../services/i18n";
import { useTranslation } from "react-i18next";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";

import { api } from "../services/api";
import { useRouter } from "expo-router";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function AuthScreen() {
  useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { isDarkMode: isDark } = useTheme();
  const styles = getStyles(isDark);

  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  useEffect(() => {
    let active = true;
    void api
      .capabilities()
      .then((c) => {
        if (active)
          setAccountStatus(
            !c.accounts
              ? "auth.accountServicesAreUnavailablePublicMarketsAnd"
              : !c.registration
                ? "auth.emailRegistrationIsUnavailableExistingVerifiedUsers"
                : "",
          );
      })
      .catch(() => {
        if (active)
          setAccountStatus("auth.accountServiceIsUnavailableCheckTheApi");
      });
    return () => {
      active = false;
    };
  }, []);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState("register");
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setVerificationCode("");
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      Alert.alert(
        i18n.t("auth.errorTitle"),
        i18n.t("auth.pleaseFillInAllFields"),
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(
        i18n.t("auth.errorTitle"),
        i18n.t("auth.passwordsDoNotMatch"),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      await api.register({
        firstName,
        lastName,
        email,
        password,
      });
      Alert.alert(
        i18n.t("auth.successTitle"),
        i18n.t("auth.checkYourEmailForTheVerificationCode"),
      );
      setStep("verify");
    } catch (err) {
      setError(
        err instanceof Error ? userError(err) : "auth.accountRequestFailed",
      );
      Alert.alert(
        i18n.t("auth.errorTitle"),
        err instanceof Error
          ? i18n.t(userError(err))
          : i18n.t("auth.registrationFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!email || !verificationCode) {
      Alert.alert(
        i18n.t("auth.errorTitle"),
        i18n.t("auth.pleaseEnterYourEmailAndVerificationCode"),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      await api.verify({ email, verificationCode });
      Alert.alert(i18n.t("auth.successTitle"), i18n.t("auth.verified"));
      setIsLogin(true);
      setStep("register");
      resetFields();
    } catch (err) {
      setError(
        err instanceof Error ? userError(err) : "auth.accountRequestFailed",
      );
      Alert.alert(
        i18n.t("auth.errorTitle"),
        err instanceof Error
          ? i18n.t(userError(err))
          : i18n.t("auth.verificationFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(
        i18n.t("auth.errorTitle"),
        i18n.t("auth.emailAndPasswordAreRequired"),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await api.login({ email, password });
      await login(res.user, res.token);
      Alert.alert(
        i18n.t("auth.successTitle"),
        i18n.t("auth.welcome", {
          name: res.user.firstName + " " + res.user.lastName,
        }),
      );
      resetFields();
      router.replace("/home");
    } catch (err) {
      setError(
        err instanceof Error ? userError(err) : "auth.accountRequestFailed",
      );
      Alert.alert(
        i18n.t("auth.errorTitle"),
        err instanceof Error
          ? i18n.t(userError(err))
          : i18n.t("auth.loginFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.authBox}>
        {accountStatus ? <Text>{i18n.t(accountStatus)}</Text> : null}
        {error ? <Text accessibilityRole="alert">{i18n.t(error)}</Text> : null}
        <View style={styles.tabs}>
          <TouchableOpacity
            onPress={() => setIsLogin(true)}
            style={isLogin ? styles.activeTab : styles.inactiveTab}
          >
            <Text style={styles.tabText}>{i18n.t("auth.logIn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setIsLogin(false);
              setStep("register");
            }}
            style={!isLogin ? styles.activeTab : styles.inactiveTab}
          >
            <Text style={styles.tabText}>{i18n.t("common:action.signUp")}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={isDark ? "#38bdf8" : "#007bff"}
          />
        ) : isLogin ? (
          <>
            <TextInput
              placeholder={i18n.t("auth.email")}
              accessibilityLabel={i18n.t("auth.email")}
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
            />
            <TextInput
              placeholder={i18n.t("auth.password")}
              accessibilityLabel={i18n.t("auth.password")}
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />
            <TouchableOpacity onPress={handleLogin} style={styles.button}>
              <Text style={styles.buttonText}>{i18n.t("auth.logIn")}</Text>
            </TouchableOpacity>
          </>
        ) : step === "register" ? (
          <>
            <TextInput
              placeholder={i18n.t("auth.firstName")}
              accessibilityLabel={i18n.t("auth.firstName")}
              placeholderTextColor="#888"
              value={firstName}
              onChangeText={setFirstName}
              style={styles.input}
            />
            <TextInput
              placeholder={i18n.t("auth.lastName")}
              accessibilityLabel={i18n.t("auth.lastName")}
              placeholderTextColor="#888"
              value={lastName}
              onChangeText={setLastName}
              style={styles.input}
            />
            <TextInput
              placeholder={i18n.t("auth.email")}
              accessibilityLabel={i18n.t("auth.email")}
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
            />
            <TextInput
              placeholder={i18n.t("auth.password")}
              accessibilityLabel={i18n.t("auth.password")}
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />
            <TextInput
              placeholder={i18n.t("auth.confirmPassword")}
              accessibilityLabel={i18n.t("auth.confirmPassword")}
              placeholderTextColor="#888"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
              secureTextEntry
            />
            <TouchableOpacity onPress={handleRegister} style={styles.button}>
              <Text style={styles.buttonText}>
                {i18n.t("common:action.signUp")}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              placeholder={i18n.t("auth.verificationCode")}
              accessibilityLabel={i18n.t("auth.verificationCode")}
              placeholderTextColor="#888"
              value={verificationCode}
              onChangeText={setVerificationCode}
              style={styles.input}
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={handleVerifyEmail} style={styles.button}>
              <Text style={styles.buttonText}>
                {i18n.t("auth.verifyEmail")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: isDark ? "#0f172a" : "#f9f9f9",
    },
    authBox: {
      width: "85%",
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
      padding: 20,
      borderRadius: 10,
      elevation: 5,
    },
    tabs: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "#334155" : "#ddd",
      marginBottom: 10,
    },
    activeTab: {
      flex: 1,
      borderBottomWidth: 2,
      borderBottomColor: "#3b82f6",
      paddingVertical: 8,
    },
    inactiveTab: {
      flex: 1,
      paddingVertical: 8,
    },
    tabText: {
      textAlign: "center",
      fontSize: 16,
      fontWeight: "bold",
      color: isDark ? "#f1f5f9" : "#333",
    },
    input: {
      borderWidth: 1,
      borderColor: isDark ? "#475569" : "#ccc",
      backgroundColor: isDark ? "#1e293b" : "#fff",
      color: isDark ? "#f1f5f9" : "#000",
      padding: 10,
      borderRadius: 6,
      marginBottom: 10,
    },
    button: {
      backgroundColor: "#3b82f6",
      padding: 12,
      borderRadius: 6,
      alignItems: "center",
    },
    buttonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "bold",
    },
  });
