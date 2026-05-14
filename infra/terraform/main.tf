terraform {
  required_providers {
    yandex = {
      source = "yandex-cloud/yandex"
    }
  }
  required_version = ">= 0.13"
}

provider "yandex" {
  zone                     = var.zone
  cloud_id                 = var.cloud_id
  folder_id                = var.folder_id
  service_account_key_file = var.service_account_key_file
}

data "yandex_vpc_network" "audio_network" {
  name = "default"
}

resource "yandex_vpc_subnet" "audio_subnet" {
  network_id     = data.yandex_vpc_network.audio_network.id
  name           = var.subnet_name
  v4_cidr_blocks = ["10.10.0.0/24"]
  zone           = var.zone
}

resource "yandex_vpc_security_group" "audio_sg" {
  name        = "audio-seeker-sg"
  description = "Security group for audio seeker"
  network_id  = data.yandex_vpc_network.audio_network.id

  ingress {
    protocol       = "TCP"
    description    = "SSH"
    v4_cidr_blocks = ["0.0.0.0/0"]
    port           = 22
  }

  ingress {
    protocol       = "TCP"
    description    = "HTTP"
    v4_cidr_blocks = ["0.0.0.0/0"]
    port           = 80
  }

  ingress {
    protocol       = "TCP"
    description    = "API"
    v4_cidr_blocks = ["0.0.0.0/0"]
    port           = 8000
  }

  ingress {
    protocol       = "TCP"
    description    = "Minio"
    v4_cidr_blocks = ["0.0.0.0/0"]
    port           = 9001
  }

  egress {
    protocol       = "ANY"
    description    = "Allow all outgoing traffic"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

data "yandex_compute_image" "ubuntu" {
  family = "ubuntu-2204-lts"
}

output "ubuntu_id" {
  value = data.yandex_compute_image.ubuntu.id
}

resource "yandex_container_registry" "audio_registry" {
  name = "audio-seeker-registry"
}

resource "yandex_iam_service_account" "docker_puller_sa" {
  name        = "audio-seeker-docker-puller"
  description = "Service account for pulling Docker images from Container Registry"
}

resource "yandex_container_registry_iam_binding" "audio_registry_puller" {
  registry_id = yandex_container_registry.audio_registry.id
  role        = "container-registry.images.puller"

  members = [
    "serviceAccount:${yandex_iam_service_account.docker_puller_sa.id}"
  ]
}

resource "yandex_compute_instance" "audio_vm" {
  name        = var.vm_name
  platform_id = "standard-v3"
  zone        = var.zone

  service_account_id        = yandex_iam_service_account.docker_puller_sa.id
  allow_stopping_for_update = true

  resources {
    cores  = 2
    memory = 4
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.ubuntu.id
      size     = 30
      type     = "network-ssd"
    }
  }

  network_interface {
    subnet_id          = yandex_vpc_subnet.audio_subnet.id
    nat                = true
    security_group_ids = [yandex_vpc_security_group.audio_sg.id]
  }

  metadata = {
    ssh-keys = "ubuntu:${file(var.ssh_public_key_path)}"
  }

}