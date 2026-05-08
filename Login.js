import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

export default function Login({ navigation }) {
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Smart Reminders</Text>
        <Text style={styles.subtitle}>
          Your AI-powered reminder assistant
        </Text>
      </View>

      {/* Form */}
      <View style={styles.card}>

        <TextInput
          placeholder="Username"
          style={styles.input}
        />

        <TextInput
          placeholder="Password"
          secureTextEntry
          style={styles.input}
        />

        <Text style={styles.forgot}>Forgot Password?</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate("Dashboard")}
        >
          <Text style={styles.buttonText}>Login →</Text>
        </TouchableOpacity>

        <Text style={styles.or}>OR CONTINUE WITH</Text>

        <TouchableOpacity style={styles.googleBtn}>
          <Text>Continue with Google</Text>
        </TouchableOpacity>

      </View>

      {/* Footer */}
      <Text style={styles.footer}>
        Don’t have an account? <Text style={{ color: "#630ed4" }}>Sign Up</Text>
      </Text>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fef7ff",
    justifyContent: "center",
    padding: 20
  },
  header: {
    alignItems: "center",
    marginBottom: 30
  },
  title: {
    fontSize: 26,
    fontWeight: "bold"
  },
  subtitle: {
    color: "gray",
    marginTop: 5
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 20
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 10,
    marginBottom: 15
  },
  forgot: {
    textAlign: "right",
    color: "#630ed4",
    marginBottom: 20
  },
  button: {
    backgroundColor: "#630ed4",
    padding: 15,
    borderRadius: 30,
    alignItems: "center"
  },
  buttonText: {
    color: "white",
    fontWeight: "bold"
  },
  or: {
    textAlign: "center",
    marginVertical: 20,
    color: "gray"
  },
  googleBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    borderRadius: 30,
    alignItems: "center"
  },
  footer: {
    textAlign: "center",
    marginTop: 20,
    color: "gray"
  }
});