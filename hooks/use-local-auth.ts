import { useEffect, useState } from "react";

interface User {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
}

export function getAuthState() {
  if (typeof window === "undefined") {
    return { isAuthenticated: false };
  }
  const storedUser = localStorage.getItem("auth_user");
  if (!storedUser) return { isAuthenticated: false };
  try {
    const user = JSON.parse(storedUser);
    return { isAuthenticated: true, user };
  } catch (e) {
    return { isAuthenticated: false };
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    const storedUser = localStorage.getItem("auth_user");
    if (storedUser) {
      const u = JSON.parse(storedUser);
      setUser(u);
      setRoles(u.roles);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const users = JSON.parse(localStorage.getItem("auth_users") || "[]");
    const foundUser = users.find((u: any) => u.email === email && u.password === password);
    if (foundUser) {
      const { password: _, ...userWithoutPassword } = foundUser;
      setUser(userWithoutPassword);
      setRoles(userWithoutPassword.roles);
      localStorage.setItem("auth_user", JSON.stringify(userWithoutPassword));
      return { success: true, user: userWithoutPassword };
    }
    return { success: false, error: "Credenciais inválidas" };
  };

  const logout = () => {
    setUser(null);
    setRoles([]);
    localStorage.removeItem("auth_user");
  };

  const signup = async (email: string, fullName: string, password: string) => {
    // Check if email already exists
    const users = JSON.parse(localStorage.getItem("auth_users") || "[]");
    const existingUser = users.find((u: any) => u.email === email);
    if (existingUser) {
      return { success: false, error: "E-mail já cadastrado" };
    }
    
    const id = "user-" + Date.now();
    const newUser: User = {
      id,
      email,
      fullName,
      roles: [users.length === 0 ? "admin" : "analyzer"],
    };
    
    users.push({ ...newUser, password });
    localStorage.setItem("auth_users", JSON.stringify(users));
    
    setUser(newUser);
    setRoles(newUser.roles);
    localStorage.setItem("auth_user", JSON.stringify(newUser));
    return { success: true, user: newUser };
  };

  const checkEmailExists = (email: string) => {
    const users = JSON.parse(localStorage.getItem("auth_users") || "[]");
    return users.some((u: any) => u.email === email);
  };

  const resetPassword = (email: string, newPassword: string) => {
    const users = JSON.parse(localStorage.getItem("auth_users") || "[]");
    const userIndex = users.findIndex((u: any) => u.email === email);
    if (userIndex === -1) {
      return { success: false, error: "E-mail não encontrado" };
    }
    
    users[userIndex].password = newPassword;
    localStorage.setItem("auth_users", JSON.stringify(users));
    return { success: true };
  };

  return { 
    session: user ? { user } : null, 
    user, 
    loading, 
    roles, 
    isAuthenticated: !!user,
    login,
    logout,
    signup,
    checkEmailExists,
    resetPassword
  };
}
