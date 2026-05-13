variable "zone" {
  type    = string
  default = "ru-central1-a"
}

variable "cloud_id" {
  type = string
}

variable "folder_id" {
  type = string
}

variable "service_account_key_file" {
  type = string
}

variable "ssh_public_key_path" {
  type = string
}

variable "vm_name" {
  type    = string
  default = "audio-seeker-vm"
}

variable "network_name" {
  type    = string
  default = "audio-seeker-net"
}

variable "subnet_name" {
  type    = string
  default = "audio-seeker-subnet"
}