import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react-native'
import { useState } from 'react'
import { Image, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useReceiptSrc } from '@/features/receipts/hooks/useReceiptSrc'
import type { Attachment } from '@/features/receipts/schemas'
import { IconButton } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'

/** Full-screen viewer for receipt photos: pinch to zoom (iOS), arrows between photos. */
export function ReceiptViewer({
  images,
  index,
  onIndexChange,
  onDelete,
}: {
  images: Attachment[]
  index: number | null
  onIndexChange: (index: number | null) => void
  onDelete?: (attachment: Attachment) => void
}) {
  const current = index === null ? undefined : images[index]
  const close = () => onIndexChange(null)
  return (
    <Modal visible={current !== undefined} animationType="fade" onRequestClose={close}>
      <SafeAreaView style={styles.root}>
        {current && index !== null ? (
          <>
            <View style={styles.bar}>
              <IconButton icon={X} label="Close" onPress={close} color="#ffffff" />
              <Text style={styles.title} numberOfLines={1}>
                {current.name} ({index + 1} of {images.length})
              </Text>
              {onDelete ? (
                <IconButton
                  icon={Trash2}
                  label={`Delete ${current.name}`}
                  onPress={() => onDelete(current)}
                  color="#ffffff"
                />
              ) : null}
            </View>
            <ZoomableImage key={current.path} attachment={current} />
            {images.length > 1 ? (
              <View style={styles.nav}>
                <IconButton
                  icon={ChevronLeft}
                  label="Previous photo"
                  disabled={index === 0}
                  onPress={() => onIndexChange(index - 1)}
                  color="#ffffff"
                />
                <IconButton
                  icon={ChevronRight}
                  label="Next photo"
                  disabled={index === images.length - 1}
                  onPress={() => onIndexChange(index + 1)}
                  color="#ffffff"
                />
              </View>
            ) : null}
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

function ZoomableImage({ attachment }: { attachment: Attachment }) {
  const { width, height } = useWindowDimensions()
  const { src, error, missing } = useReceiptSrc(attachment.path)
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          {failed || error
            ? 'This photo couldn’t be loaded.'
            : missing
              ? 'This photo hasn’t finished uploading yet.'
              : 'Loading…'}
        </Text>
      </View>
    )
  }
  return (
    <ScrollView
      style={styles.zoom}
      contentContainerStyle={styles.center}
      maximumZoomScale={4}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Image
        source={{ uri: src }}
        style={{ width, height: height * 0.75 }}
        resizeMode="contain"
        accessibilityLabel={attachment.name}
        onError={() => setFailed(true)}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  title: { flex: 1, color: '#ffffff' },
  zoom: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  message: { color: '#ffffff', textAlign: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', padding: 8 },
})
