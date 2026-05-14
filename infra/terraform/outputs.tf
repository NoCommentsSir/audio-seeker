output "vm_public_ip" {
  value = yandex_compute_instance.audio_vm.network_interface[0].nat_ip_address
}

output "registry_id" {
  value = yandex_container_registry.audio_registry.id
}

output "registry_url" {
  value = "registry.yandexcloud.net/${yandex_container_registry.audio_registry.id}"
}