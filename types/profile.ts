export type Profile = {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  role: "root" | "admin";
  status: "active" | "inactive";
  avatar?: string;
  photoURL?: string;
  createdAt?: string;
  emailVerified?: boolean;
};
